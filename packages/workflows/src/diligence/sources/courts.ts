import { ApplicationFailure } from '@temporalio/common';
import { z } from 'zod';

import { pinnedGet } from '../../builder/aiClient';
import { CapReached } from '../../builder/caps';
import { providerKey } from '../../builder/providerKeys';
import { parsedJson } from '../../builder/teamAi';
import { LOOK_BACK_YEARS, yearsBefore } from '../lookBack';

const COURTLISTENER_ORIGIN = 'https://www.courtlistener.com';
const SEARCH_TIMEOUT_MS = 60_000;
const REQUEST_SPACING_MS = 12_000;
const HOURLY_LIMIT_RESETS_MS = 60 * 60 * 1000;

export class CourtListenerLimit extends CapReached {
  constructor() {
    super('Waiting for the CourtListener hourly limit', new Date(Date.now() + HOURLY_LIMIT_RESETS_MS));
  }
}

const DISTRICTS_BY_STATE: Record<string, string[]> = {
  AL: ['alm', 'aln', 'als'],
  AK: ['ak'],
  AZ: ['az'],
  AR: ['are', 'arw'],
  CA: ['cac', 'cae', 'can', 'cas'],
  CO: ['co'],
  CT: ['ct'],
  DE: ['de'],
  DC: ['dc'],
  FL: ['flm', 'fln', 'fls'],
  GA: ['gam', 'gan', 'gas'],
  HI: ['hi'],
  ID: ['id'],
  IL: ['ilc', 'iln', 'ils'],
  IN: ['inn', 'ins'],
  IA: ['ian', 'ias'],
  KS: ['ks'],
  KY: ['kye', 'kyw'],
  LA: ['lae', 'lam', 'law'],
  ME: ['me'],
  MD: ['md'],
  MA: ['ma'],
  MI: ['mie', 'miw'],
  MN: ['mn'],
  MS: ['msn', 'mss'],
  MO: ['moe', 'mow'],
  MT: ['mt'],
  NE: ['ne'],
  NV: ['nv'],
  NH: ['nh'],
  NJ: ['nj'],
  NM: ['nm'],
  NY: ['nye', 'nyn', 'nys', 'nyw'],
  NC: ['nce', 'ncm', 'ncw'],
  ND: ['nd'],
  OH: ['ohn', 'ohs'],
  OK: ['oke', 'okn', 'okw'],
  OR: ['or'],
  PA: ['pae', 'pam', 'paw'],
  RI: ['ri'],
  SC: ['sc'],
  SD: ['sd'],
  TN: ['tne', 'tnm', 'tnw'],
  TX: ['txe', 'txn', 'txs', 'txw'],
  UT: ['ut'],
  VT: ['vt'],
  VA: ['vae', 'vaw'],
  WA: ['wae', 'waw'],
  WV: ['wvn', 'wvs'],
  WI: ['wie', 'wiw'],
  WY: ['wy'],
  PR: ['pr'],
  GU: ['gu'],
  VI: ['vi'],
  MP: ['nmi'],
};

const STATE_BY_COURT = new Map(
  Object.entries(DISTRICTS_BY_STATE).flatMap(([state, districts]) =>
    districts.flatMap((district) => [
      [`${district}d`, state],
      [`${district}b`, state],
    ]),
  ),
);

const BANKRUPTCY_COURTS = new Set(
  Object.values(DISTRICTS_BY_STATE).flatMap((districts) => districts.map((district) => `${district}b`)),
);

const docket = z
  .object({
    caseName: z.string(),
    court: z.string(),
    court_id: z.string(),
    docketNumber: z.string(),
    dateFiled: z.string().nullable(),
    dateTerminated: z.string().nullable(),
    suitNature: z.string(),
    docket_absolute_url: z.string(),
  })
  .loose();

const searchPage = z.object({ results: z.array(docket) });

type Docket = z.infer<typeof docket>;

export interface CourtSubject {
  key: string;
  name: string;
}

export interface CourtCandidate {
  subjectKey: string;
  source: 'courts';
  kind: 'civil' | 'criminal' | 'bankruptcy' | 'appeal' | null;
  caseName: string;
  court: string;
  docketNumber: string;
  filedOn: string | null;
  terminatedOn: string | null;
  natureOfSuit: string | null;
  url: string;
  raw: Docket;
}

function kindOf(hit: Docket): CourtCandidate['kind'] {
  if (BANKRUPTCY_COURTS.has(hit.court_id) || hit.court_id.startsWith('bap')) {
    return 'bankruptcy';
  }
  if (/-(cr|mj|po)-/i.test(hit.docketNumber)) {
    return 'criminal';
  }
  if (/-cv-/i.test(hit.docketNumber)) {
    return 'civil';
  }
  if (/^ca(\d+|dc|fc)$/.test(hit.court_id)) {
    return 'appeal';
  }
  return null;
}

function inFirmState(hit: Docket, state: string | null): boolean {
  const courtState = STATE_BY_COURT.get(hit.court_id);
  return state === null || courtState === undefined || courtState === state;
}

function partyQuery(name: string): string {
  const since = yearsBefore(new Date(), LOOK_BACK_YEARS).toISOString().slice(0, 10);
  return `party:"${name.replaceAll('"', '\\"')}" AND (dateFiled:[${since} TO *] OR dateTerminated:[${since} TO *] OR (*:* -dateTerminated:[* TO *]))`;
}

export function courtListenerPacer({ now, sleep }: { now: () => number; sleep: (ms: number) => Promise<void> }) {
  const nextSlot = new Map<string, number>();
  return async (accountId: string) => {
    const slot = Math.max(now(), nextSlot.get(accountId) ?? 0);
    nextSlot.set(accountId, slot + REQUEST_SPACING_MS);
    await sleep(slot - now());
  };
}

const teamPacer = courtListenerPacer({
  now: Date.now,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
});

async function searchParty(
  baseUrl: string,
  token: string,
  name: string,
  signal: AbortSignal | undefined,
): Promise<Docket[] | 'refused'> {
  const params = new URLSearchParams({ type: 'd', q: partyQuery(name) });
  const response = await pinnedGet(
    `${baseUrl}/search/?${params}`,
    { authorization: `Token ${token}` },
    { timeoutMs: SEARCH_TIMEOUT_MS, signal },
  );
  if (response.status === 401 || response.status === 403) {
    return 'refused';
  }
  if (response.status === 429) {
    throw new CourtListenerLimit();
  }
  if (response.status >= 500) {
    throw new Error(`CourtListener answered ${response.status}`);
  }
  if (response.status >= 300) {
    throw ApplicationFailure.nonRetryable(`CourtListener answered ${response.status}`);
  }
  const body = parsedJson(response.text);
  if (body === undefined) {
    throw ApplicationFailure.nonRetryable('CourtListener answered with something that is not JSON');
  }
  return searchPage.parse(body).results;
}

export async function searchFederalCourts(
  {
    accountId,
    subjects,
    state,
    signal,
  }: { accountId: string; subjects: CourtSubject[]; state: string | null; signal?: AbortSignal },
  pace = teamPacer,
): Promise<{ skipped: string } | { candidates: CourtCandidate[] }> {
  const credentials = await providerKey(accountId, 'courts');
  if (!credentials) {
    return { skipped: 'Connect a CourtListener token to search federal courts' };
  }
  const candidates: CourtCandidate[] = [];
  for (const subject of subjects) {
    await pace(accountId);
    const hits = await searchParty(credentials.baseUrl, credentials.apiKey, subject.name, signal);
    if (hits === 'refused') {
      return { skipped: 'The CourtListener token was refused; reconnect it' };
    }
    for (const hit of hits) {
      if (inFirmState(hit, state)) {
        candidates.push({
          subjectKey: subject.key,
          source: 'courts',
          kind: kindOf(hit),
          caseName: hit.caseName,
          court: hit.court,
          docketNumber: hit.docketNumber,
          filedOn: hit.dateFiled,
          terminatedOn: hit.dateTerminated,
          natureOfSuit: hit.suitNature || null,
          url: `${COURTLISTENER_ORIGIN}${hit.docket_absolute_url}`,
          raw: hit,
        });
      }
    }
  }
  return { candidates };
}
