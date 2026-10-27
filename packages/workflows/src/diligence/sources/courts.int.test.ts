import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { docketHit, fakeCourtListener, searchPage } from '../../../test-support/fake-courtlistener';
import { provisionAccount, type IntegrationAccount } from '../../../test-support/integration-harness';
import { CourtListenerLimit, courtListenerPacer, searchFederalCourts } from './courts';

const network = vi.hoisted(() => ({ trustedFakeUrl: '' }));

vi.mock('../../builder/publicUrl', async (importOriginal) => {
  const { publicAddressOf, ...rest } = await importOriginal<typeof import('../../builder/publicUrl')>();
  return {
    ...rest,
    publicAddressOf: async (url: string) =>
      url.startsWith(network.trustedFakeUrl) ? { address: '127.0.0.1', family: 4 } : publicAddressOf(url),
  };
});

const VIRTUAL_MS_PER_REAL_MS = 20;
const LOOPBACK_JITTER_MS = 500;
const SPACED = 12_000 - LOOPBACK_JITTER_MS;
const clock = { startedAt: 0, now: () => (performance.now() - clock.startedAt) * VIRTUAL_MS_PER_REAL_MS };
let teamA: IntegrationAccount;
let teamB: IntegrationAccount;
let courtListener: Awaited<ReturnType<typeof fakeCourtListener>>;
let pace: ReturnType<typeof courtListenerPacer>;

const ROWAN = { key: 'firm', name: 'Rowan Fixture Plumbing' };

async function connectCourtListener(team: IntegrationAccount, token: string) {
  await team.user
    .rpc('save_provider_credential', { p_account_id: team.accountId, p_kind: 'courts', p_api_key: token })
    .throwOnError();
  await team.admin
    .from('provider_credential')
    .update({ base_url: courtListener.baseUrl })
    .eq('account_id', team.accountId)
    .eq('kind', 'courts')
    .throwOnError();
}

beforeAll(async () => {
  [teamA, teamB] = await Promise.all([provisionAccount(), provisionAccount()]);
  courtListener = await fakeCourtListener({ status: 200, body: searchPage([]) }, () => clock.now());
  network.trustedFakeUrl = courtListener.baseUrl;
});

afterAll(async () => {
  courtListener.close();
  for (const team of [teamA, teamB]) {
    await team.admin.from('accounts').delete().eq('id', team.accountId);
    await team.cleanup();
  }
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-27T15:00:00Z'));
  clock.startedAt = performance.now();
  pace = courtListenerPacer({
    now: clock.now,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms / VIRTUAL_MS_PER_REAL_MS)),
  });
  courtListener.received.length = 0;
  courtListener.reply.status = 200;
  courtListener.reply.body = searchPage([]);
  courtListener.reply.delayMs = 0;
});

afterEach(() => vi.useRealTimers());

function search(subjects: { key: string; name: string }[], state: string | null, team = teamA) {
  return searchFederalCourts({ accountId: team.accountId, subjects, state }, pace);
}

async function candidatesOf(subjects: { key: string; name: string }[], state: string | null) {
  const result = await search(subjects, state);
  if (!('candidates' in result)) {
    throw new Error(`expected candidates, got ${JSON.stringify(result)}`);
  }
  return result.candidates;
}

describe('searchFederalCourts without a CourtListener token', () => {
  it('skips, calling nobody, and says how to turn it on', async () => {
    expect(await search([ROWAN], 'TX')).toEqual({
      skipped: 'Connect a CourtListener token to search federal courts',
    });
    expect(courtListener.received).toEqual([]);
  });
});

describe('searchFederalCourts', () => {
  beforeAll(async () => {
    await connectCourtListener(teamA, 'cl-team-a');
    await connectCourtListener(teamB, 'cl-team-b');
  });

  it("searches federal dockets for each subject as a party with the team's token, filed or still open in the last ten years", async () => {
    await search([ROWAN, { key: 'owner:0', name: 'Dana Rowan' }], null);

    const window = '(dateFiled:[2016-10-27 TO *] OR dateTerminated:[2016-10-27 TO *] OR (*:* -dateTerminated:[* TO *]))';
    expect(courtListener.received).toEqual([
      expect.objectContaining({
        path: '/api/rest/v4/search/',
        query: { type: 'd', q: `party:"Rowan Fixture Plumbing" AND ${window}` },
        headers: expect.objectContaining({ authorization: 'Token cl-team-a' }),
      }),
      expect.objectContaining({
        path: '/api/rest/v4/search/',
        query: { type: 'd', q: `party:"Dana Rowan" AND ${window}` },
        headers: expect.objectContaining({ authorization: 'Token cl-team-a' }),
      }),
    ]);
  });

  it('escapes double quotes in a subject name', async () => {
    await search([{ key: 'firm', name: 'Rowan "Ace" Plumbing' }], null);

    expect(courtListener.received[0]!.query.q).toMatch(/^party:"Rowan \\"Ace\\" Plumbing" AND /);
  });

  it('sends one request at a time, at least 12 seconds apart, for each team', async () => {
    const subjects = [ROWAN, { key: 'owner:0', name: 'Dana Rowan' }, { key: 'owner:1', name: 'Lee Rowan' }];

    await Promise.all([search(subjects, null), search(subjects.slice(0, 1), null, teamB)]);

    const timesFor = (token: string) =>
      courtListener.received
        .filter(({ headers }) => headers.authorization === `Token ${token}`)
        .map(({ at }) => at);
    const [first, second, third] = timesFor('cl-team-a');
    expect(second! - first!).toBeGreaterThanOrEqual(SPACED);
    expect(third! - second!).toBeGreaterThanOrEqual(SPACED);
    expect(timesFor('cl-team-b')[0]).toBeLessThan(second!);
  });

  it('keeps pacing a team across searches that overlap', async () => {
    await Promise.all([search([ROWAN], null), search([ROWAN], null)]);

    const [first, second] = courtListener.received.map(({ at }) => at);
    expect(second! - first!).toBeGreaterThanOrEqual(SPACED);
  });

  it('returns each docket as a candidate finding for the subject it was searched for', async () => {
    const hit = docketHit({});
    courtListener.reply.body = searchPage([hit]);

    expect(await candidatesOf([ROWAN, { key: 'owner:0', name: 'Dana Rowan' }], null)).toEqual([
      {
        subjectKey: 'firm',
        source: 'courts',
        kind: 'civil',
        caseName: 'Rowan Fixture Plumbing v. Harbour Supply',
        court: 'District Court, S.D. Texas',
        docketNumber: '4:21-cv-00412',
        filedOn: '2021-03-04',
        terminatedOn: null,
        natureOfSuit: '190 Contract: Other',
        url: 'https://www.courtlistener.com/docket/61234567/rowan-fixture-plumbing-v-harbour-supply/',
        raw: hit,
      },
      expect.objectContaining({ subjectKey: 'owner:0', docketNumber: '4:21-cv-00412' }),
    ]);
  });

  it('reports a docket with no nature of suit as null', async () => {
    courtListener.reply.body = searchPage([docketHit({ suitNature: '' })]);

    expect((await candidatesOf([ROWAN], null))[0]!.natureOfSuit).toBeNull();
  });

  it('marks bankruptcy courts and panels as bankruptcy, criminal, magistrate and petty offense dockets as criminal, circuit dockets as appeals, and leaves the rest unknown', async () => {
    courtListener.reply.body = searchPage([
      docketHit({ court_id: 'txsb', docketNumber: '22-90011' }),
      docketHit({ court_id: 'bap9', docketNumber: '23-1187' }),
      docketHit({ docketNumber: '4:23-cr-00087' }),
      docketHit({ docketNumber: '4:23-mj-01544' }),
      docketHit({ docketNumber: '4:23-po-00012' }),
      docketHit({ docketNumber: '4:21-cv-00412' }),
      docketHit({ court_id: 'ca5', docketNumber: '24-20155' }),
      docketHit({ court_id: 'cadc', docketNumber: '24-5101' }),
      docketHit({ court_id: 'cafc', docketNumber: '24-1330' }),
      docketHit({ docketNumber: '4:23-mc-00031' }),
    ]);

    const candidates = await candidatesOf([ROWAN], null);

    expect(candidates.map(({ kind }) => kind)).toEqual([
      'bankruptcy',
      'bankruptcy',
      'criminal',
      'criminal',
      'criminal',
      'civil',
      'appeal',
      'appeal',
      'appeal',
      null,
    ]);
  });

  it("keeps only cases in courts of the firm's state, or courts with no single state", async () => {
    courtListener.reply.body = searchPage([
      docketHit({ court_id: 'txsd', docketNumber: 'texas-district' }),
      docketHit({ court_id: 'txnb', docketNumber: 'texas-bankruptcy' }),
      docketHit({ court_id: 'ca5', docketNumber: 'fifth-circuit' }),
      docketHit({ court_id: 'nysd', docketNumber: 'new-york-district' }),
      docketHit({ court_id: 'canb', docketNumber: 'california-bankruptcy' }),
      docketHit({ court_id: 'nmid', docketNumber: 'northern-mariana-islands' }),
    ]);

    const inTexas = await candidatesOf([ROWAN], 'TX');
    const anywhere = await candidatesOf([ROWAN], null);
    const inNewMexico = await candidatesOf([ROWAN], 'NM');

    expect(inTexas.map(({ docketNumber }) => docketNumber)).toEqual(['texas-district', 'texas-bankruptcy', 'fifth-circuit']);
    expect(anywhere).toHaveLength(6);
    expect(inNewMexico.map(({ docketNumber }) => docketNumber)).toEqual(['fifth-circuit']);
  });

  it.each([401, 403])('skips, asking the team to reconnect, when CourtListener refuses the token with %i', async (status) => {
    courtListener.reply.status = status;
    courtListener.reply.body = { detail: 'Invalid token.' };

    expect(await search([ROWAN, { key: 'owner:0', name: 'Dana Rowan' }], null)).toEqual({
      skipped: 'The CourtListener token was refused; reconnect it',
    });
  });

  it('stops a search in flight when the run is cancelled', async () => {
    courtListener.reply.delayMs = 2_000;
    const cancelled = new AbortController();
    setTimeout(() => cancelled.abort(), 50);
    const started = performance.now();

    const failure = await searchFederalCourts(
      { accountId: teamA.accountId, subjects: [ROWAN], state: null, signal: cancelled.signal },
      pace,
    ).catch((error: unknown) => error);

    expect(failure).toMatchObject({ name: 'AbortError' });
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  it.each([
    [503, false],
    [500, false],
    [404, true],
  ])('fails when CourtListener answers %i, at once: %s', async (status, failsAtOnce) => {
    courtListener.reply.status = status;
    courtListener.reply.body = { detail: 'nope' };

    const failure = await search([ROWAN], null).catch((error: unknown) => error);

    expect(failure).toMatchObject({ message: `CourtListener answered ${status}` });
    expect((failure as { nonRetryable?: boolean }).nonRetryable === true).toBe(failsAtOnce);
  });

  it('pauses for the CourtListener hourly limit when it answers 429', async () => {
    courtListener.reply.status = 429;
    courtListener.reply.body = { detail: 'Request was throttled.' };

    const failure = await search([ROWAN], null).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(CourtListenerLimit);
    expect(failure).toMatchObject({
      message: 'Waiting for the CourtListener hourly limit',
      resumeAt: new Date('2026-10-27T16:00:00Z'),
    });
  });

  it.each([
    [500, 'CourtListener answered 500', false],
    [404, 'CourtListener answered 404', true],
    [200, 'CourtListener answered with something that is not JSON', true],
  ])('fails when CourtListener answers %i with a page that is not JSON', async (status, message, failsAtOnce) => {
    courtListener.reply.status = status;
    courtListener.reply.body = '<!DOCTYPE html><title>Server Error 500</title>';

    const failure = await search([ROWAN], null).catch((error: unknown) => error);

    expect(failure).toMatchObject({ message });
    expect((failure as { nonRetryable?: boolean }).nonRetryable === true).toBe(failsAtOnce);
  });
});
