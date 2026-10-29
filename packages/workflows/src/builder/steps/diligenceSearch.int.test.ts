import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { docketHit, fakeCourtListener, searchPage } from '../../../test-support/fake-courtlistener';
import { provisionAccount, seedDeal, type IntegrationAccount } from '../../../test-support/integration-harness';
import { CourtListenerLimit } from '../../diligence/sources/courts';
import { diligenceSearch } from './diligenceSearch';

const network = vi.hoisted(() => ({ trustedFakeUrls: [] as string[] }));

vi.mock('../publicUrl', async (importOriginal) => {
  const { publicAddressOf, ...rest } = await importOriginal<typeof import('../publicUrl')>();
  return {
    ...rest,
    publicAddressOf: async (url: string) =>
      network.trustedFakeUrls.some((trusted) => url.startsWith(trusted))
        ? { address: '127.0.0.1', family: 4 }
        : publicAddressOf(url),
  };
});

const NEWS_PATH = '/v2/acts/data_xplorer~google-news-scraper-fast/run-sync-get-dataset-items';
const PLACE_PATH = '/v2/acts/compass~crawler-google-places/run-sync-get-dataset-items';
const REVIEWS_PATH = '/v2/acts/compass~Google-Maps-Reviews-Scraper/run-sync-get-dataset-items';

const BUSINESS = 'business:rowan fixture plumbing';
const PERSON = 'person:ana delgado';

const article = {
  title: 'Rowan Fixture Plumbing wins county contract',
  source: 'Harbor Gazette',
  publishedAt: '2026-09-14T08:00:00.000Z',
  url: 'https://harborgazette.example/rowan-contract',
  description: 'The plumbing firm will service county buildings.',
};
const place = { placeId: 'ChIJrowanfixtureplumbing0000', title: 'Rowan Fixture Plumbing', url: 'https://www.google.com/maps/place/rowan' };
const review = {
  title: 'Rowan Fixture Plumbing',
  stars: 1,
  text: 'Never showed up',
  publishedAtDate: '2026-08-01T10:00:00.000Z',
  responseFromOwnerText: 'We came the next morning',
};
const docket = docketHit({
  caseName: 'Harbour Supply v. Rowan Fixture Plumbing',
  court: 'District Court, D. Oregon',
  court_id: 'ord',
  docketNumber: '3:21-cv-00412',
  docket_absolute_url: '/docket/61234567/harbour-supply-v-rowan-fixture-plumbing/',
  dateFiled: '2021-03-04',
  suitNature: '190 Contract: Other',
});

let owner: IntegrationAccount;
let dealId: string;
let workflowId: string;
let versionId: string;
let screeningImportId: string;
let courtListener: Awaited<ReturnType<typeof fakeCourtListener>>;
const apify = { baseUrl: '', received: [] as string[], keywords: [] as string[], answered: 0, delayMs: 0, server: undefined as Server | undefined };

async function workflowRun(): Promise<string> {
  const { data } = await owner.admin
    .from('workflow_run')
    .insert({
      account_id: owner.accountId,
      workflow_id: workflowId,
      version_id: versionId,
      trigger_kind: 'manual',
      trigger_ref: crypto.randomUUID(),
      trigger_node_id: 'start',
    })
    .select('id')
    .single()
    .throwOnError();
  return data.id;
}

function search(runId: string, idempotencyKey: string, config: Record<string, unknown> = { dealId }) {
  return diligenceSearch.execute({
    context: { accountId: owner.accountId, runId, idempotencyKey },
    config,
    input: {},
  });
}

async function findings(runId: string) {
  const { data } = await owner.admin
    .from('diligence_finding')
    .select('account_id, deal_id, subject_kind, subject_name, subject_key, source, severity, title, summary, source_url, occurred_on')
    .eq('run_id', runId)
    .order('source')
    .order('subject_key')
    .order('title')
    .throwOnError();
  return data;
}

function courtQueries() {
  return courtListener.received.map((request) => request.query.q!.match(/^party:"([^"]+)"/)![1]);
}

beforeAll(async () => {
  owner = await provisionAccount();
  courtListener = await fakeCourtListener({ status: 200, body: searchPage([docket]) });
  apify.server = createServer((request, response) => {
    let raw = '';
    request.on('data', (chunk) => (raw += chunk));
    request.on('end', () => {
      apify.received.push(request.url!);
      if (request.url === NEWS_PATH) {
        apify.keywords.push(...JSON.parse(raw).keywords);
      }
      const body = { [NEWS_PATH]: [article], [PLACE_PATH]: [place], [REVIEWS_PATH]: [review] }[request.url!];
      setTimeout(() => {
        apify.answered += 1;
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify(body));
      }, apify.delayMs);
    });
  });
  await new Promise<void>((resolve) => apify.server!.listen(0, '127.0.0.1', resolve));
  apify.baseUrl = `http://127.0.0.1:${(apify.server.address() as AddressInfo).port}/v2`;
  network.trustedFakeUrls = [courtListener.baseUrl, apify.baseUrl];

  const { data: firm } = await owner.admin
    .from('firm')
    .insert({ account_id: owner.accountId, name: 'Rowan Fixture Plumbing', state: 'OR', owner_names: ['Ana Delgado'] })
    .select('id')
    .single()
    .throwOnError();
  dealId = await seedDeal(owner.admin, owner.accountId, owner.userId, { firm_id: firm.id });
  const { data: workflow } = await owner.admin
    .from('workflow')
    .insert({ account_id: owner.accountId, name: 'Background search' })
    .select('id')
    .single()
    .throwOnError();
  workflowId = workflow.id;
  const { data: version } = await owner.admin
    .from('workflow_version')
    .insert({
      account_id: owner.accountId,
      workflow_id: workflowId,
      schema_version: 2,
      graph: { nodes: [], edges: [] },
      published_at: new Date().toISOString(),
      published_by: owner.userId,
    })
    .select('id')
    .single()
    .throwOnError();
  versionId = version.id;

  const { data: screening } = await owner.admin
    .from('screening_import')
    .insert({ url: 'https://csl.test/consolidated', status: 'succeeded', as_of: '2026-10-26', entry_count: 1 })
    .select('id')
    .single()
    .throwOnError();
  screeningImportId = screening.id;
  await owner.admin
    .from('screening_entry')
    .insert({
      import_id: screeningImportId,
      list_name: 'Specially Designated Nationals (SDN) - Treasury Department',
      source_entry_id: 'sdn-1',
      name: 'Ana Delgado',
      entry_type: 'individual',
      programs: ['SDGT'],
      source_url: 'https://csl.test/sdn',
      as_of: '2026-10-26',
      raw: { id: 'sdn-1' },
    })
    .throwOnError();
});

afterAll(async () => {
  courtListener.close();
  apify.server!.close();
  await owner.admin.from('screening_import').delete().eq('id', screeningImportId).throwOnError();
  await owner.admin.from('workflow_run').delete().eq('account_id', owner.accountId);
  await owner.admin.from('accounts').delete().eq('id', owner.accountId);
  await owner.cleanup();
});

const sanctionsFinding = {
  subject_kind: 'person',
  subject_name: 'Ana Delgado',
  subject_key: PERSON,
  source: 'sanctions',
  severity: null,
  title: 'Ana Delgado on Specially Designated Nationals (SDN) - Treasury Department',
  summary: 'Matched Ana Delgado at 100%; programs SDGT',
  source_url: 'https://csl.test/sdn',
  occurred_on: null,
};

describe('diligenceSearch without court or news providers', () => {
  it('still screens sanctions and says why courts and news were skipped', async () => {
    const runId = await workflowRun();

    const output = await search(runId, `${runId}:search`);

    expect(output).toEqual({
      runId: expect.any(String),
      skipped: {
        courts: 'Connect a CourtListener token to search federal courts',
        news: 'Connect an email lookup provider to search news',
      },
    });
    expect(await findings(output.runId as string)).toEqual([
      { account_id: owner.accountId, deal_id: dealId, ...sanctionsFinding },
    ]);
    expect(courtListener.received).toEqual([]);
    expect(apify.received).toEqual([]);
  });
});

describe('diligenceSearch with an out of date sanctions list', () => {
  it('says why sanctions were skipped next to courts and news', async () => {
    const runId = await workflowRun();
    vi.setSystemTime(Date.now() + 90 * 24 * 60 * 60 * 1000);

    try {
      expect(await search(runId, `${runId}:search`)).toEqual({
        runId: expect.any(String),
        skipped: {
          courts: 'Connect a CourtListener token to search federal courts',
          news: 'Connect an email lookup provider to search news',
          sanctions: 'The sanctions list is out of date',
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('diligenceSearch', () => {
  beforeAll(async () => {
    await owner.user
      .rpc('save_provider_credential', { p_account_id: owner.accountId, p_kind: 'courts', p_api_key: 'cl-token' })
      .throwOnError();
    await owner.user
      .rpc('save_provider_credential', {
        p_account_id: owner.accountId,
        p_kind: 'email_lookup',
        p_api_key: 'apify-key',
        p_actor_id: 'acme/site-contacts',
      })
      .throwOnError();
    for (const [kind, baseUrl] of [
      ['courts', courtListener.baseUrl],
      ['email_lookup', apify.baseUrl],
    ] as const) {
      await owner.admin
        .from('provider_credential')
        .update({ base_url: baseUrl })
        .eq('account_id', owner.accountId)
        .eq('kind', kind)
        .throwOnError();
    }
    await owner.admin
      .from('outreach_setting')
      .upsert({ account_id: owner.accountId, daily_cap: 10, lookup_monthly_cap: 100 }, { onConflict: 'account_id' })
      .throwOnError();
  });

  it('lets the news search finish before failing on a court error, so nothing is left paying in the background', async () => {
    const runId = await workflowRun();
    courtListener.reply.status = 404;
    apify.delayMs = 1_000;
    apify.answered = 0;

    const failure = await search(runId, `${runId}:search`).catch((error: unknown) => error);
    const answeredWhenFailed = apify.answered;

    courtListener.reply.status = 200;
    apify.delayMs = 0;
    courtListener.received.length = 0;
    expect(failure).toMatchObject({ message: 'CourtListener answered 404' });
    expect(answeredWhenFailed).toBe(4);
  }, 60_000);

  it("records every candidate from courts, news and sanctions as an unrated finding on a run tied to the workflow run", async () => {
    const runId = await workflowRun();

    const output = await search(runId, `${runId}:search`);

    expect(output).toEqual({ runId: expect.any(String), skipped: {} });
    const { data: run } = await owner.admin
      .from('diligence_run')
      .select('account_id, deal_id, workflow_run_id')
      .eq('id', output.runId as string)
      .single()
      .throwOnError();
    expect(run).toEqual({ account_id: owner.accountId, deal_id: dealId, workflow_run_id: runId });
    const court = {
      source: 'courts',
      severity: null,
      title: 'Harbour Supply v. Rowan Fixture Plumbing',
      summary: 'District Court, D. Oregon; docket 3:21-cv-00412; 190 Contract: Other',
      source_url: 'https://www.courtlistener.com/docket/61234567/harbour-supply-v-rowan-fixture-plumbing/',
      occurred_on: '2021-03-04',
    };
    const news = {
      source: 'news',
      severity: null,
      title: article.title,
      summary: 'Harbor Gazette: The plumbing firm will service county buildings.',
      source_url: article.url,
      occurred_on: '2026-09-14',
    };
    const business = { subject_kind: 'business', subject_name: 'Rowan Fixture Plumbing', subject_key: BUSINESS };
    const person = { subject_kind: 'person', subject_name: 'Ana Delgado', subject_key: PERSON };
    expect((await findings(output.runId as string)).map(({ account_id: _a, deal_id: _d, ...finding }) => finding)).toEqual([
      { ...business, ...court },
      { ...person, ...court },
      { ...sanctionsFinding },
      { ...business, ...news },
      { ...person, ...news },
      {
        ...business,
        source: 'reviews',
        severity: null,
        title: '1-star review of Rowan Fixture Plumbing',
        summary: 'Never showed up\nOwner replied: We came the next morning',
        source_url: place.url,
        occurred_on: '2026-08-01',
      },
    ]);
    expect(courtQueries()).toEqual(['Rowan Fixture Plumbing', 'Ana Delgado']);
  }, 60_000);

  it('searches again on a retry only the court subjects a crashed attempt had not finished, and duplicates no finding', async () => {
    const runId = await workflowRun();
    courtListener.received.length = 0;
    apify.received.length = 0;

    const crashed = search(runId, `${runId}:search`);
    await vi.waitFor(() => expect(courtListener.received).toHaveLength(1), { timeout: 30_000 });
    courtListener.reply.status = 503;
    await expect(crashed).rejects.toThrow('CourtListener answered 503');
    courtListener.reply.status = 200;
    const newsCalls = apify.received.length;

    const output = await search(runId, `${runId}:search`);

    expect(output).toEqual({ runId: expect.any(String), skipped: {} });
    expect(await findings(output.runId as string)).toHaveLength(6);
    expect(courtQueries()).toEqual(['Rowan Fixture Plumbing', 'Ana Delgado', 'Ana Delgado']);
    expect(apify.received).toHaveLength(newsCalls);
  }, 90_000);

  it('stops for an hour when CourtListener answers that the hourly limit is used up', async () => {
    const runId = await workflowRun();
    courtListener.reply.status = 429;
    const stoppedAt = Date.now();

    const failure = await search(runId, `${runId}:search`).catch((error: unknown) => error);

    courtListener.reply.status = 200;
    expect(failure).toBeInstanceOf(CourtListenerLimit);
    expect(failure).toMatchObject({ message: 'Waiting for the CourtListener hourly limit' });
    expect(Math.abs((failure as CourtListenerLimit).resumeAt!.getTime() - (stoppedAt + 60 * 60 * 1000))).toBeLessThan(60_000);
  }, 60_000);

  it('searches news for every business name only when the step asks for all names', async () => {
    const { data: business } = await owner.admin
      .from('public_business')
      .insert({ name: 'Rowan Fixture Plumbing' })
      .select('id')
      .single()
      .throwOnError();
    await owner.admin
      .from('ppp_loan')
      .insert({ loan_number: `ppp-${crypto.randomUUID()}`, business_id: business.id, borrower_name: 'Rowan Plumbing Holdings', jobs_reported: 4 })
      .throwOnError();
    const { data: firm } = await owner.admin
      .from('firm')
      .insert({ account_id: owner.accountId, name: 'Rowan Fixture Plumbing', state: 'OR', public_business_id: business.id })
      .select('id')
      .single()
      .throwOnError();
    const otherDealId = await seedDeal(owner.admin, owner.accountId, owner.userId, { firm_id: firm.id });
    const namesSearched = async (searchAllNames?: boolean) => {
      const runId = await workflowRun();
      apify.keywords.length = 0;
      await search(runId, `${runId}:search`, { dealId: otherDealId, ...(searchAllNames !== undefined && { searchAllNames }) });
      return [...apify.keywords].sort();
    };

    try {
      expect(await namesSearched()).toEqual(['"Rowan Fixture Plumbing"']);
      expect(await namesSearched(true)).toEqual(['"Rowan Fixture Plumbing"', '"Rowan Plumbing Holdings"']);
    } finally {
      await owner.admin.from('public_business').delete().eq('id', business.id);
    }
  }, 120_000);

  it('calls no source again when a finished search is retried, even after the providers are disconnected', async () => {
    const runId = await workflowRun();
    const first = await search(runId, `${runId}:search`);
    courtListener.received.length = 0;
    apify.received.length = 0;
    await owner.admin.from('provider_credential').delete().eq('account_id', owner.accountId).throwOnError();

    expect(await search(runId, `${runId}:search`)).toEqual(first);
    expect(courtListener.received).toEqual([]);
    expect(apify.received).toEqual([]);
    expect(await findings(first.runId as string)).toHaveLength(6);
  }, 90_000);
});
