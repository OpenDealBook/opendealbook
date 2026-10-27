import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { provisionAccount, seedDeal, type IntegrationAccount } from '../../../test-support/integration-harness';
import { CapReached } from '../../builder/caps';
import { searchNews } from './news';

const network = vi.hoisted(() => ({ trustedFakeUrl: '' }));

vi.mock('../../builder/publicUrl', async (importOriginal) => {
  const { publicAddressOf } = await importOriginal<typeof import('../../builder/publicUrl')>();
  return {
    publicAddressOf: async (url: string) =>
      url.startsWith(network.trustedFakeUrl) ? { address: '127.0.0.1', family: 4 } : publicAddressOf(url),
  };
});

const NEWS_PATH = '/v2/acts/data_xplorer~google-news-scraper-fast/run-sync-get-dataset-items';
const PLACE_PATH = '/v2/acts/compass~crawler-google-places/run-sync-get-dataset-items';
const REVIEWS_PATH = '/v2/acts/compass~Google-Maps-Reviews-Scraper/run-sync-get-dataset-items';

type Reply = { status: number; body: unknown };

const apify = {
  baseUrl: '',
  replies: {} as Record<string, Reply>,
  received: [] as { path: string; headers: IncomingHttpHeaders; body: Record<string, unknown> }[],
  server: undefined as Server | undefined,
};

let owner: IntegrationAccount;
let firmId: string;
let dealId: string;

type Subject = { key: string; kind: 'business' | 'person'; name: string; sources: string[] };

const business: Subject = { key: 'business:rowan fixture plumbing', kind: 'business', name: 'Rowan Fixture Plumbing', sources: ['firm', 'ppp_loan'] };
const variant: Subject = { key: 'business:rfp holdings', kind: 'business', name: 'RFP Holdings', sources: ['sba_loan'] };
const person: Subject = { key: 'person:ana delgado', kind: 'person', name: 'Ana Delgado', sources: ['deal_contact'] };

const article = {
  title: 'Rowan Fixture Plumbing wins county contract',
  source: 'Harbor Gazette',
  publishedAt: '2026-09-14T08:00:00.000Z',
  publishedTimestamp: 1789372800000,
  url: 'https://harborgazette.example/rowan-contract',
  description: 'The plumbing firm will service county buildings.',
  image: null,
  metadata: { keyword: '"Rowan Fixture Plumbing"', sourceType: 'search', timeframe: 'all', scrapeTimestamp: '2026-10-27T00:00:00Z' },
};

const staleArticle = { ...article, title: 'Old news', publishedAt: '2014-01-02T08:00:00.000Z', url: 'https://harborgazette.example/old' };

const place = { placeId: 'ChIJrowanfixtureplumbing0000', title: 'Rowan Fixture Plumbing, LLC', url: 'https://www.google.com/maps/place/rowan' };

function review(stars: number, publishedAtDate: string) {
  return {
    title: 'Rowan Fixture Plumbing',
    placeId: place.placeId,
    stars,
    text: `A ${stars} star visit`,
    publishedAtDate,
    reviewUrl: null,
    responseFromOwnerText: stars === 1 ? 'We are sorry to hear this' : null,
    url: 'https://www.google.com/maps/review-scraper-place-url',
  };
}

const reviews = [review(1, '2026-08-01T10:00:00.000Z'), review(5, '2026-07-01T10:00:00.000Z'), review(2, '2025-03-04T10:00:00.000Z')];

function answer(path: string, reply: Reply) {
  apify.replies[path] = reply;
}

function search(idempotencyKey: string, subjects: Subject[] = [business], options: { searchAllNames?: boolean; signal?: AbortSignal } = {}) {
  return searchNews({
    accountId: owner.accountId,
    dealId,
    firmId,
    state: 'or',
    subjects,
    searchAllNames: options.searchAllNames ?? false,
    idempotencyKey,
    signal: options.signal,
  });
}

async function lookups() {
  const { data } = await owner.admin
    .from('paid_lookup')
    .select('id, kind, provider, outcome, result, firm_id, deal_id')
    .eq('account_id', owner.accountId)
    .order('created_at')
    .throwOnError();
  return data;
}

async function pointProviderAt(baseUrl: string) {
  await owner.admin
    .from('provider_credential')
    .update({ base_url: baseUrl })
    .eq('account_id', owner.accountId)
    .eq('kind', 'email_lookup')
    .throwOnError();
}

async function setLookupCap(cap: number) {
  await owner.admin
    .from('outreach_setting')
    .upsert({ account_id: owner.accountId, daily_cap: 10, lookup_monthly_cap: cap }, { onConflict: 'account_id' })
    .throwOnError();
}

beforeAll(async () => {
  owner = await provisionAccount();
  apify.server = createServer((request, response) => {
    let raw = '';
    request.on('data', (chunk) => (raw += chunk));
    request.on('end', () => {
      apify.received.push({ path: request.url!, headers: request.headers, body: JSON.parse(raw) });
      const reply = apify.replies[request.url!] ?? { status: 404, body: { error: 'unknown actor' } };
      response.writeHead(reply.status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(reply.body));
    });
  });
  await new Promise<void>((resolve) => apify.server!.listen(0, '127.0.0.1', resolve));
  apify.baseUrl = `http://127.0.0.1:${(apify.server.address() as AddressInfo).port}/v2`;
  network.trustedFakeUrl = apify.baseUrl;
  const { data: firm } = await owner.admin
    .from('firm')
    .insert({ account_id: owner.accountId, name: 'Rowan Fixture Plumbing' })
    .select('id')
    .single()
    .throwOnError();
  firmId = firm.id;
  dealId = await seedDeal(owner.admin, owner.accountId, owner.userId, { firm_id: firmId });
});

afterAll(async () => {
  apify.server!.close();
  await owner.admin.from('accounts').delete().eq('id', owner.accountId);
  await owner.cleanup();
});

describe('searchNews (integration)', () => {
  it('skips, spending nothing, when the team has no email lookup provider', async () => {
    await setLookupCap(5);

    expect(await search('run-1:news')).toEqual({ skipped: 'Connect an email lookup provider to search news' });
    expect(apify.received).toEqual([]);
    expect(await lookups()).toEqual([]);
  });

  it('pauses on the lookup cap before calling the provider', async () => {
    await owner.user
      .rpc('save_provider_credential', {
        p_account_id: owner.accountId,
        p_kind: 'email_lookup',
        p_api_key: 'apify-team-key',
        p_actor_id: 'acme/site-contacts',
      })
      .throwOnError();
    await pointProviderAt(apify.baseUrl);
    await setLookupCap(0);

    await expect(search('run-1:news')).rejects.toBeInstanceOf(CapReached);
    expect(apify.received).toEqual([]);
    expect(await lookups()).toEqual([]);
  });

  it("searches news for every subject and low-star reviews for businesses on the team's key, recording each paid lookup on the deal", async () => {
    await setLookupCap(10);
    answer(NEWS_PATH, { status: 200, body: [article, staleArticle] });
    answer(PLACE_PATH, { status: 200, body: [place] });
    answer(REVIEWS_PATH, { status: 200, body: reviews });

    const output = await search('run-1:news', [business, variant, person]);

    const newsFor = (subjectKey: string) => ({
      subjectKey,
      source: 'news',
      title: article.title,
      publisher: article.source,
      publishedOn: '2026-09-14',
      url: article.url,
      snippet: article.description,
      raw: article,
    });
    expect(output).toEqual({
      candidates: [
        newsFor(business.key),
        {
          subjectKey: business.key,
          source: 'reviews',
          placeName: 'Rowan Fixture Plumbing',
          stars: 1,
          text: 'A 1 star visit',
          publishedOn: '2026-08-01',
          url: place.url,
          ownerResponse: 'We are sorry to hear this',
          raw: reviews[0],
        },
        {
          subjectKey: business.key,
          source: 'reviews',
          placeName: 'Rowan Fixture Plumbing',
          stars: 2,
          text: 'A 2 star visit',
          publishedOn: '2025-03-04',
          url: place.url,
          ownerResponse: null,
          raw: reviews[2],
        },
        newsFor(person.key),
      ],
    });
    expect(apify.received.every((call) => call.headers.authorization === 'Bearer apify-team-key')).toBe(true);
    const bodiesAt = (path: string) => apify.received.filter((call) => call.path === path).map((call) => call.body);
    expect(bodiesAt(NEWS_PATH)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ keywords: ['"Rowan Fixture Plumbing"'], maxArticles: 10, timeframe: 'all', region_language: 'US:en', decodeUrls: true, extractImages: false }),
        expect.objectContaining({ keywords: ['"Ana Delgado" Oregon'] }),
      ]),
    );
    expect(bodiesAt(PLACE_PATH)).toEqual([
      expect.objectContaining({ searchStringsArray: ['Rowan Fixture Plumbing'], locationQuery: 'Oregon, USA', maxCrawledPlacesPerSearch: 1 }),
    ]);
    expect(bodiesAt(REVIEWS_PATH)).toEqual([
      expect.objectContaining({ placeIds: [place.placeId], maxReviews: 50, reviewsSort: 'newest', reviewsStartDate: '10 years' }),
    ]);
    const recorded = await lookups();
    expect(recorded).toHaveLength(4);
    expect(recorded.every((row) => row.kind === 'email_lookup' && row.provider === 'apify' && row.firm_id === firmId && row.deal_id === dealId)).toBe(true);
    expect(recorded.map((row) => row.outcome)).toEqual(['found', 'found', 'found', 'found']);
  });

  it('returns the recorded results without paying again when retried', async () => {
    apify.received.length = 0;

    const output = await search('run-1:news', [business, person]);

    expect(output).toMatchObject({
      candidates: [
        { subjectKey: business.key, source: 'news' },
        { subjectKey: business.key, source: 'reviews' },
        { subjectKey: business.key, source: 'reviews' },
        { subjectKey: person.key, source: 'news' },
      ],
    });
    expect(apify.received).toEqual([]);
    expect(await lookups()).toHaveLength(4);
  });

  it('records not found and looks up no reviews when no place matches the business', async () => {
    answer(NEWS_PATH, { status: 200, body: [] });
    answer(PLACE_PATH, { status: 200, body: [] });
    apify.received.length = 0;

    expect(await search('run-2:news')).toEqual({ candidates: [] });
    expect(apify.received.map((call) => call.path).sort()).toEqual([PLACE_PATH, NEWS_PATH]);
    expect((await lookups()).slice(4).map((row) => row.outcome)).toEqual(['not_found', 'not_found']);
  });

  it('records the place lookup as not found and looks up no reviews when the top place is a different business', async () => {
    await setLookupCap(40);
    answer(NEWS_PATH, { status: 200, body: [] });
    answer(PLACE_PATH, { status: 200, body: [{ ...place, title: 'Rowan Hardware Supply' }] });
    apify.received.length = 0;

    expect(await search('run-other-place:news')).toEqual({ candidates: [] });
    expect(apify.received.map((call) => call.path).sort()).toEqual([PLACE_PATH, NEWS_PATH]);
    expect((await lookups()).slice(-2).map((row) => row.outcome).sort()).toEqual(['not_found', 'not_found']);
  });

  it.each([
    [PLACE_PATH, 400, 'The place search provider answered 400', true],
    [REVIEWS_PATH, 503, 'The reviews provider answered 503', false],
  ])('names the provider that failed: %s answering %i', async (path, status, message, failsAtOnce) => {
    answer(NEWS_PATH, { status: 200, body: [] });
    answer(PLACE_PATH, { status: 200, body: [place] });
    answer(REVIEWS_PATH, { status: 200, body: reviews });
    answer(path, { status, body: { error: { type: 'refused' } } });

    const failure = await search(`run-${status}-named:news`).catch((error: unknown) => error);

    expect(failure).toMatchObject({ message });
    expect((failure as { nonRetryable?: boolean }).nonRetryable === true).toBe(failsAtOnce);
  });

  it('searches every business name variant when asked to', async () => {
    answer(NEWS_PATH, { status: 200, body: [] });
    answer(PLACE_PATH, { status: 200, body: [] });
    apify.received.length = 0;

    await search('run-all-names:news', [business, variant], { searchAllNames: true });

    expect(apify.received.filter((call) => call.path === NEWS_PATH).map((call) => call.body.keywords).sort()).toEqual([
      ['"RFP Holdings"'],
      ['"Rowan Fixture Plumbing"'],
    ]);
    expect(apify.received.filter((call) => call.path === PLACE_PATH)).toHaveLength(2);
  });

  it('stops the provider call when the step is cancelled', async () => {
    answer(NEWS_PATH, { status: 200, body: [article] });
    apify.received.length = 0;

    await expect(search('run-cancelled:news', [person], { signal: AbortSignal.abort() })).rejects.toThrow();
    expect(apify.received).toEqual([]);
  });

  it.each([502, 429])('records a failed lookup and lets the step retry when the provider answers %i', async (status) => {
    answer(NEWS_PATH, { status, body: { error: { type: 'upstream' } } });

    const failure = await search(`run-${status}:news`, [person]).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toMatchObject({ nonRetryable: true });
    expect(await lookups()).toContainEqual(
      expect.objectContaining({ outcome: 'failed', result: { status, body: { error: { type: 'upstream' } } } }),
    );

    const recorded = (await lookups()).length;
    answer(NEWS_PATH, { status: 200, body: [article] });
    expect(await search(`run-${status}:news`, [person])).toMatchObject({ candidates: [{ subjectKey: person.key, source: 'news' }] });
    expect(await lookups()).toHaveLength(recorded);
  });

  it.each([401, 402, 403])('skips news and reviews, keeping the lookup failed, when Apify refuses the key with %i', async (status) => {
    await setLookupCap(60);
    answer(NEWS_PATH, { status, body: { error: { type: 'refused' } } });

    expect(await search(`run-refused-${status}:news`, [person])).toEqual({
      skipped: 'The Apify key was refused or is out of credit; check it',
    });
    expect((await lookups()).at(-1)).toMatchObject({ outcome: 'failed', result: { status } });
  });

  it('keeps the lookup failed when the actor answers in an unexpected shape', async () => {
    answer(NEWS_PATH, { status: 200, body: { data: 'unexpected' } });

    const failure = await search('run-shape:news', [person]).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect((await lookups()).at(-1)).toMatchObject({ outcome: 'failed', result: {} });
  });

  it.each([
    [200, true],
    [503, false],
  ])('records a failed lookup when the provider answers %i with something that is not JSON, failing at once: %s', async (status, failsAtOnce) => {
    const server = createServer((_request, response) => {
      response.writeHead(status, { 'content-type': 'text/html' });
      response.end('<html>gateway</html>');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v2`;
    network.trustedFakeUrl = baseUrl;
    await pointProviderAt(baseUrl);

    const failure = await search(`run-html-${status}:news`, [person]).catch((error: unknown) => error);

    server.close();
    network.trustedFakeUrl = apify.baseUrl;
    await pointProviderAt(apify.baseUrl);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as { nonRetryable?: boolean }).nonRetryable === true).toBe(failsAtOnce);
    expect((await lookups()).at(-1)).toMatchObject({ outcome: 'failed', result: { status, text: '<html>gateway</html>' } });
  });
});
