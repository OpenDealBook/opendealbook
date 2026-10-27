import { ApplicationFailure } from '@temporalio/common';
import { z } from 'zod';

import { APIFY_KEY_REFUSED, paidApifyRun, type PaidRunContext } from '../../builder/paidApifyRun';
import { providerKey } from '../../builder/providerKeys';
import { screeningScore } from '../../sanctions/match';
import { uuidFromKey } from '../../uuidFromKey';
import { LOOK_BACK_YEARS, yearsBefore } from '../lookBack';
import type { DiligenceSubject } from '../subjects';

const ACTORS = {
  news: { id: 'data_xplorer/google-news-scraper-fast', provider: 'news' },
  place: { id: 'compass/crawler-google-places', provider: 'place search' },
  reviews: { id: 'compass/Google-Maps-Reviews-Scraper', provider: 'reviews' },
} as const;

type Actor = (typeof ACTORS)[keyof typeof ACTORS];

const ARTICLES_PER_SUBJECT = 10;
const REVIEWS_FETCHED = 50;
const LOW_STARS = 2;
const PLACE_NAME_MATCH = 0.8;

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  AS: 'American Samoa', GU: 'Guam', MP: 'Northern Mariana Islands', PR: 'Puerto Rico', VI: 'U.S. Virgin Islands',
};

const newsItems = z.array(
  z.object({ title: z.string(), source: z.string(), publishedAt: z.string(), url: z.string(), description: z.string() }).loose(),
);
const placeItems = z.array(z.object({ placeId: z.string(), title: z.string(), url: z.string() }).loose());
const reviewItems = z.array(
  z
    .object({
      title: z.string(),
      stars: z.number(),
      text: z.string().nullable(),
      publishedAtDate: z.string(),
      responseFromOwnerText: z.string().nullable(),
    })
    .loose(),
);

type Subject = Pick<DiligenceSubject, 'key' | 'kind' | 'name' | 'sources'>;

interface NewsRunContext extends PaidRunContext {
  idempotencyKey: string;
}

function dayOf(timestamp: string): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function paidRun<Item>(search: NewsRunContext, lookupKey: string, actor: Actor, input: unknown, result: z.ZodType<Item[]>) {
  return paidApifyRun(search, {
    lookupId: uuidFromKey(`workflow_step:${search.idempotencyKey}:${lookupKey}`),
    actor,
    input,
    result,
    found: (items) => items.length > 0,
  });
}

async function newsFor(search: NewsRunContext, subject: Subject, stateName: string | undefined, since: Date) {
  const quoted = `"${subject.name}"`;
  const query = subject.kind === 'person' ? [quoted, stateName].filter(Boolean).join(' ') : quoted;
  const articles = await paidRun(
    search,
    `news:${subject.key}`,
    ACTORS.news,
    {
      keywords: [query],
      maxArticles: ARTICLES_PER_SUBJECT,
      timeframe: 'all',
      region_language: 'US:en',
      decodeUrls: true,
      extractImages: false,
    },
    newsItems,
  );
  return articles
    .filter((article) => new Date(article.publishedAt) >= since)
    .map((article) => ({
      subjectKey: subject.key,
      source: 'news' as const,
      title: article.title,
      publisher: article.source,
      publishedOn: dayOf(article.publishedAt),
      url: article.url,
      snippet: article.description,
      raw: article,
    }));
}

async function reviewsFor(search: NewsRunContext, subject: Subject, stateName: string | undefined) {
  const [place] = await paidRun(
    search,
    `place:${subject.key}`,
    ACTORS.place,
    {
      searchStringsArray: [subject.name],
      locationQuery: stateName && `${stateName}, USA`,
      maxCrawledPlacesPerSearch: 1,
      language: 'en',
    },
    placeItems.transform((places) =>
      places.filter((place) => screeningScore(subject.name, place.title) >= PLACE_NAME_MATCH),
    ),
  );
  if (!place) {
    return [];
  }
  const reviews = await paidRun(
    search,
    `reviews:${subject.key}`,
    ACTORS.reviews,
    {
      placeIds: [place.placeId],
      maxReviews: REVIEWS_FETCHED,
      reviewsSort: 'newest',
      reviewsStartDate: `${LOOK_BACK_YEARS} years`,
      language: 'en',
      personalData: false,
    },
    reviewItems,
  );
  return reviews
    .filter((review) => review.stars <= LOW_STARS)
    .map((review) => ({
      subjectKey: subject.key,
      source: 'reviews' as const,
      placeName: review.title,
      stars: review.stars,
      text: review.text,
      publishedOn: dayOf(review.publishedAtDate),
      url: place.url,
      ownerResponse: review.responseFromOwnerText,
      raw: review,
    }));
}

export type NewsCandidate =
  | Awaited<ReturnType<typeof newsFor>>[number]
  | Awaited<ReturnType<typeof reviewsFor>>[number];

export async function searchNews(args: {
  accountId: string;
  dealId: string;
  firmId: string;
  state: string | null;
  subjects: Subject[];
  searchAllNames: boolean;
  idempotencyKey: string;
  signal?: AbortSignal;
}): Promise<{ candidates: NewsCandidate[] } | { skipped: string }> {
  const credentials = await providerKey(args.accountId, 'email_lookup');
  if (!credentials) {
    return { skipped: 'Connect an email lookup provider to search news' };
  }
  const stateName = args.state ? STATE_NAMES[args.state.toUpperCase()] : undefined;
  const since = yearsBefore(new Date(), LOOK_BACK_YEARS);
  const search = { ...args, credentials };
  const subjects = args.subjects.filter(
    (subject) => subject.kind === 'person' || args.searchAllNames || subject.sources.includes('firm'),
  );

  try {
    const perSubject = await Promise.all(
      subjects.map(async (subject) => [
        ...(await newsFor(search, subject, stateName, since)),
        ...(subject.kind === 'business' ? await reviewsFor(search, subject, stateName) : []),
      ]),
    );
    return { candidates: perSubject.flat() };
  } catch (error) {
    if (error instanceof ApplicationFailure && error.type === APIFY_KEY_REFUSED) {
      return { skipped: 'The Apify key was refused or is out of credit; check it' };
    }
    throw error;
  }
}
