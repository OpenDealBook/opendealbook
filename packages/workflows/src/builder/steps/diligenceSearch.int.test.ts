import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeBroker } from '../../../test-support/fake-broker';
import { docketHit, fakeCourtListener, searchPage } from '../../../test-support/fake-courtlistener';
import { provisionAccount, seedDeal, type IntegrationAccount } from '../../../test-support/integration-harness';
import { CourtListenerLimit } from '../../diligence/sources/courts';
import { indexScreeningNames } from '../../sanctions/load';
import { PollAgain } from '../pollAgain';
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
let broker: Awaited<ReturnType<typeof fakeBroker>>;
const apify = { baseUrl: '', received: [] as string[], keywords: [] as string[], answered: 0, delayMs: 0, server: undefined as Server | undefined };
const registry = {
  status: 200,
  organizations: [] as string[],
  received: [] as string[],
  delayMs: 0,
  inFlight: 0,
  mostInFlight: 0,
  server: undefined as Server | undefined,
};

function nppesOrganization(name: string) {
  return {
    number: '1093847562',
    basic: { organization_name: name, status: 'A' },
    other_names: [],
    taxonomies: [{ desc: 'Plumbing Contractor', primary: true }],
  };
}

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
  broker = await fakeBroker();
  network.trustedFakeUrls = [courtListener.baseUrl, apify.baseUrl, broker.origin];
  registry.server = createServer((request, response) => {
    registry.received.push(request.url!);
    registry.inFlight += 1;
    registry.mostInFlight = Math.max(registry.mostInFlight, registry.inFlight);
    setTimeout(() => {
      registry.inFlight -= 1;
      response.writeHead(registry.status, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ results: registry.organizations.map(nppesOrganization) }));
    }, registry.delayMs);
  });
  await new Promise<void>((resolve) => registry.server!.listen(0, '127.0.0.1', resolve));
  vi.stubEnv('LICENSE_REGISTRY_URL', `http://127.0.0.1:${(registry.server.address() as AddressInfo).port}`);

  const { data: firm } = await owner.admin
    .from('firm')
    .insert({ account_id: owner.accountId, name: 'Rowan Fixture Plumbing', city: 'Portland', state: 'OR', owner_names: ['Ana Delgado'] })
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
  await indexScreeningNames();
});

beforeEach(() => {
  registry.status = 200;
  registry.organizations = [];
  registry.received.length = 0;
  registry.delayMs = 0;
  registry.mostInFlight = 0;
});

afterAll(async () => {
  courtListener.close();
  apify.server!.close();
  broker.close();
  registry.server!.close();
  vi.unstubAllEnvs();
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
        licenses: ['License data is not available for OR'],
        court_records: 'Connect a court records broker to search state court cases, liens and UCC filings',
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
          licenses: ['License data is not available for OR'],
          court_records: 'Connect a court records broker to search state court cases, liens and UCC filings',
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

  beforeEach(async () => {
    await owner.admin.from('courtlistener_pace').delete().eq('account_id', owner.accountId).throwOnError();
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

    expect(output).toEqual({ runId: expect.any(String), skipped: { licenses: ['License data is not available for OR'], court_records: 'Connect a court records broker to search state court cases, liens and UCC filings' } });
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

  it('records each license the registries hold for the firm as a finding with no source link', async () => {
    const runId = await workflowRun();
    registry.organizations = ['Rowan Fixture Plumbing'];

    const output = await search(runId, `${runId}:search`);

    expect(output.skipped).toEqual({ licenses: ['License data is not available for OR'], court_records: 'Connect a court records broker to search state court cases, liens and UCC filings' });
    expect((await findings(output.runId as string)).filter((finding) => finding.source === 'licenses')).toEqual([
      {
        account_id: owner.accountId,
        deal_id: dealId,
        subject_kind: 'business',
        subject_name: 'Rowan Fixture Plumbing',
        subject_key: BUSINESS,
        source: 'licenses',
        severity: null,
        title: 'Plumbing Contractor from NPPES',
        summary: 'Licensed to Rowan Fixture Plumbing; number 1093847562; Active',
        source_url: null,
        occurred_on: null,
      },
    ]);
  }, 60_000);

  it('fails the search with the registry error when a license registry is down', async () => {
    const runId = await workflowRun();
    registry.status = 503;

    const failure = await search(runId, `${runId}:search`).catch((error: unknown) => error);

    expect(failure).toMatchObject({ message: expect.stringMatching(/^127\.0\.0\.1:\d+ answered 503$/) });
  }, 60_000);

  it('searches again on a retry only the court subjects a crashed attempt had not finished, and duplicates no finding', async () => {
    const runId = await workflowRun();
    courtListener.received.length = 0;
    apify.received.length = 0;
    registry.organizations = ['Rowan Fixture Plumbing'];

    const crashed = search(runId, `${runId}:search`);
    await vi.waitFor(() => expect(courtListener.received).toHaveLength(1), { timeout: 30_000 });
    courtListener.reply.status = 503;
    await expect(crashed).rejects.toThrow('CourtListener answered 503');
    courtListener.reply.status = 200;
    const newsCalls = apify.received.length;

    const output = await search(runId, `${runId}:search`);

    expect(output).toEqual({ runId: expect.any(String), skipped: { licenses: ['License data is not available for OR'], court_records: 'Connect a court records broker to search state court cases, liens and UCC filings' } });
    expect(await findings(output.runId as string)).toHaveLength(7);
    expect(courtQueries()).toEqual(['Rowan Fixture Plumbing', 'Ana Delgado', 'Ana Delgado']);
    expect(apify.received).toHaveLength(newsCalls);
    expect(registry.received).toHaveLength(1);
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

  it('searches news and licenses for every business name, one license search at a time, only when the step asks for all names', async () => {
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
    registry.organizations = ['Rowan Fixture Plumbing', 'Rowan Plumbing Holdings'];
    registry.delayMs = 300;
    const namesSearched = async (searchAllNames?: boolean) => {
      const runId = await workflowRun();
      apify.keywords.length = 0;
      const output = await search(runId, `${runId}:search`, { dealId: otherDealId, ...(searchAllNames !== undefined && { searchAllNames }) });
      const licensed = (await findings(output.runId as string))
        .filter((finding) => finding.source === 'licenses')
        .map((finding) => finding.subject_name);
      return { news: [...apify.keywords].sort(), licenses: licensed };
    };

    try {
      expect(await namesSearched()).toEqual({ news: ['"Rowan Fixture Plumbing"'], licenses: ['Rowan Fixture Plumbing'] });
      expect(await namesSearched(true)).toEqual({
        news: ['"Rowan Fixture Plumbing"', '"Rowan Plumbing Holdings"'],
        licenses: ['Rowan Fixture Plumbing', 'Rowan Plumbing Holdings'],
      });
      expect(registry.mostInFlight).toBe(1);
    } finally {
      await owner.admin.from('public_business').delete().eq('id', business.id);
    }
  }, 120_000);

  it('searches courts, news and licenses no more when a finished search is retried, even after the providers are disconnected', async () => {
    const runId = await workflowRun();
    const first = await search(runId, `${runId}:search`);
    courtListener.received.length = 0;
    apify.received.length = 0;
    registry.received.length = 0;
    await owner.admin.from('provider_credential').delete().eq('account_id', owner.accountId).throwOnError();

    expect(await search(runId, `${runId}:search`)).toEqual(first);
    expect(courtListener.received).toEqual([]);
    expect(apify.received).toEqual([]);
    expect(registry.received).toEqual([]);
    expect(await findings(first.runId as string)).toHaveLength(6);
  }, 90_000);
});

describe('diligenceSearch with a court records broker', () => {
  const HOUR_MS = 60 * 60 * 1000;
  const OTHER_SOURCES_SKIPPED = {
    courts: 'Connect a CourtListener token to search federal courts',
    news: 'Connect an email lookup provider to search news',
    licenses: ['License data is not available for OR'],
  };
  const UCC_FILING = {
    state: 'DE',
    filing_number: '2021 1234567',
    filing_type: 'consensual.ucc',
    filing_date: '2021-05-02',
    status: 'Active',
    parties: [
      { role: 'debtor', name: 'ROWAN FIXTURE PLUMBING LLC' },
      { role: 'secured_party', name: 'Harbour Equipment Finance' },
    ],
  };
  const DEBTOR_ONLY_FILING = {
    ...UCC_FILING,
    filing_number: '2020 7654321',
    filing_date: '2020-01-15',
    parties: [{ role: 'debtor', name: 'ROWAN FIXTURE PLUMBING LLC' }],
  };
  const LAWSUIT = {
    title: 'Harbour Supply v. Rowan Fixture Plumbing',
    docket_number: '2022-CI-04411',
    court: 'Multnomah County Circuit Court',
    date_filed: '2022-02-10',
    normalized_status: 'open',
    is_bankruptcy: false,
  };

  async function connect(provider: 'baselayer' | 'middesk', path = '') {
    await owner.user
      .rpc('save_provider_credential', {
        p_account_id: owner.accountId,
        p_kind: 'court_records',
        p_api_key: `${provider}-key`,
        p_provider: provider,
      })
      .throwOnError();
    await owner.admin
      .from('provider_credential')
      .update({ base_url: `${broker.origin}${path}` })
      .eq('account_id', owner.accountId)
      .eq('kind', 'court_records')
      .throwOnError();
  }

  async function brokerFindings(runId: string) {
    const { data } = await owner.admin
      .from('diligence_finding')
      .select('subject_key, source, title, summary, source_url, occurred_on, raw')
      .eq('run_id', runId)
      .eq('source', 'court_records')
      .order('title')
      .throwOnError();
    return data;
  }

  beforeEach(() => broker.reset());

  afterEach(async () => {
    vi.useRealTimers();
    await owner.admin.from('provider_credential').delete().eq('account_id', owner.accountId).throwOnError();
  });

  it('checks again in 5 minutes while Baselayer works, resuming each step, then records its liens and cases once', async () => {
    await connect('baselayer');
    const runId = await workflowRun();
    broker.routes.set('POST /searches', { status: 202, body: { id: 'srch-1', state: 'PENDING' } });

    const searching = await search(runId, `${runId}:search`).catch((error: unknown) => error);

    expect(searching).toBeInstanceOf(PollAgain);
    expect(Math.abs((searching as PollAgain).resumeAt.getTime() - (Date.now() + 5 * 60 * 1000))).toBeLessThan(60_000);
    expect(broker.received).toEqual([
      expect.objectContaining({ route: 'POST /searches', body: { name: 'Rowan Fixture Plumbing', address: 'Portland, OR' } }),
    ]);

    broker.routes.set('GET /searches/srch-1', {
      status: 200,
      body: { id: 'srch-1', state: 'COMPLETED', business: { id: 'bl-rowan', registrations: [], addresses: [{ state: 'OR' }] } },
    });
    broker.routes.set('POST /lien_searches', { status: 202, body: { id: 'lien-1', state: 'PENDING' } });
    broker.routes.set('POST /docket_searches', { status: 202, body: { id: 'dock-1', state: 'PENDING' } });
    broker.received.length = 0;

    expect(await search(runId, `${runId}:search`).catch((error: unknown) => error)).toBeInstanceOf(PollAgain);
    expect(broker.received.map(({ route }) => route)).toEqual(['GET /searches/srch-1', 'POST /lien_searches', 'POST /docket_searches']);

    broker.routes.set('GET /lien_searches/lien-1', { status: 200, body: { id: 'lien-1', state: 'COMPLETED', filings: [UCC_FILING, DEBTOR_ONLY_FILING] } });
    broker.routes.set('GET /docket_searches/dock-1', { status: 200, body: { id: 'dock-1', state: 'COMPLETED', dockets: [LAWSUIT] } });
    broker.received.length = 0;

    const output = await search(runId, `${runId}:search`);

    expect(output.skipped).toEqual(OTHER_SOURCES_SKIPPED);
    expect(broker.received.map(({ route }) => route)).toEqual(['GET /lien_searches/lien-1', 'GET /docket_searches/dock-1']);
    expect(await brokerFindings(output.runId as string)).toEqual([
      {
        subject_key: BUSINESS,
        source: 'court_records',
        title: 'Harbour Equipment Finance',
        summary: 'UCC filing; DE; 2021 1234567',
        source_url: null,
        occurred_on: '2021-05-02',
        raw: expect.objectContaining({ broker: 'baselayer', kind: 'ucc', jurisdiction: 'DE', filedOn: '2021-05-02', open: true, reference: '2021 1234567' }),
      },
      {
        subject_key: BUSINESS,
        source: 'court_records',
        title: 'Harbour Supply v. Rowan Fixture Plumbing',
        summary: 'Lawsuit; Multnomah County Circuit Court; 2022-CI-04411',
        source_url: null,
        occurred_on: '2022-02-10',
        raw: expect.objectContaining({
          broker: 'baselayer',
          kind: 'litigation',
          jurisdiction: 'Multnomah County Circuit Court',
          filedOn: '2022-02-10',
          open: true,
          reference: '2022-CI-04411',
        }),
      },
      {
        subject_key: BUSINESS,
        source: 'court_records',
        title: 'UCC filing',
        summary: 'UCC filing; DE; 2020 7654321',
        source_url: null,
        occurred_on: '2020-01-15',
        raw: expect.objectContaining({ broker: 'baselayer', reference: '2020 7654321' }),
      },
    ]);
    expect(registry.received).toHaveLength(1);

    broker.received.length = 0;
    expect(await search(runId, `${runId}:search`)).toEqual(output);
    expect(broker.received).toEqual([]);
    expect(await brokerFindings(output.runId as string)).toHaveLength(3);
  }, 120_000);

  it('records the liens, cases and bankruptcies of the business Middesk already verified for the firm', async () => {
    await connect('middesk', '/v1');
    const { data: deal } = await owner.admin.from('deal').select('firm_id').eq('id', dealId).single().throwOnError();
    await owner.admin
      .from('middesk_business')
      .upsert({ account_id: owner.accountId, firm_id: deal.firm_id!, business_id: 'mdsk-rowan' })
      .throwOnError();
    const done = (product: string) => ({ product, status: 'completed', completed_at: '2026-10-30T12:00:00Z' });
    const list = (data: unknown[]) => ({ status: 200, body: { data, has_more: false } });
    broker.routes.set(
      'GET /v1/businesses/mdsk-rowan/orders',
      list(['business_verification_verify', 'litigations', 'liens', 'bankruptcies'].map(done)),
    );
    broker.routes.set('GET /v1/businesses/mdsk-rowan/liens', list([]));
    broker.routes.set('GET /v1/businesses/mdsk-rowan/litigations', list([]));
    broker.routes.set(
      'GET /v1/businesses/mdsk-rowan/bankruptcies',
      list([{ case_number: '20-31455', chapter: 11, court: 'Bankr. D. Or.', filing_date: '2020-03-01' }]),
    );
    const runId = await workflowRun();

    const output = await search(runId, `${runId}:search`);

    expect(output.skipped).toEqual(OTHER_SOURCES_SKIPPED);
    expect(await brokerFindings(output.runId as string)).toEqual([
      {
        subject_key: BUSINESS,
        source: 'court_records',
        title: 'Chapter 11 bankruptcy',
        summary: 'Bankruptcy; Bankr. D. Or.; 20-31455',
        source_url: null,
        occurred_on: '2020-03-01',
        raw: expect.objectContaining({ broker: 'middesk', kind: 'bankruptcy', jurisdiction: 'Bankr. D. Or.', filedOn: '2020-03-01', open: null, reference: '20-31455' }),
      },
    ]);
  }, 60_000);

  it('gives up 24 hours after its first broker check and says the broker did not finish', async () => {
    await connect('baselayer');
    const runId = await workflowRun();
    broker.routes.set('POST /searches', { status: 202, body: { id: 'srch-2', state: 'PENDING' } });
    broker.routes.set('GET /searches/srch-2', { status: 200, body: { id: 'srch-2', state: 'EXECUTING' } });
    expect(await search(runId, `${runId}:search`).catch((error: unknown) => error)).toBeInstanceOf(PollAgain);

    vi.setSystemTime(Date.now() + 23 * HOUR_MS);
    expect(await search(runId, `${runId}:search`).catch((error: unknown) => error)).toBeInstanceOf(PollAgain);

    vi.setSystemTime(Date.now() + 2 * HOUR_MS);
    const output = await search(runId, `${runId}:search`);

    expect(output).toMatchObject({ skipped: { court_records: 'Baselayer did not finish within 24 hours' } });
    expect(await brokerFindings(output.runId as string)).toEqual([]);
  }, 90_000);

  it('starts the check over with the new broker when the team switches brokers mid-run', async () => {
    await connect('middesk', '/v1');
    const { data: deal } = await owner.admin.from('deal').select('firm_id').eq('id', dealId).single().throwOnError();
    await owner.admin
      .from('middesk_business')
      .upsert({ account_id: owner.accountId, firm_id: deal.firm_id!, business_id: 'mdsk-rowan' })
      .throwOnError();
    broker.routes.set('GET /v1/businesses/mdsk-rowan/orders', {
      status: 200,
      body: { data: [{ product: 'business_verification_verify', status: 'pending', completed_at: null }], has_more: false },
    });
    const runId = await workflowRun();
    expect(await search(runId, `${runId}:search`).catch((error: unknown) => error)).toBeInstanceOf(PollAgain);

    vi.setSystemTime(Date.now() + 25 * HOUR_MS);
    await connect('baselayer');
    broker.routes.set('POST /searches', { status: 202, body: { id: 'srch-4', state: 'PENDING' } });
    broker.received.length = 0;

    expect(await search(runId, `${runId}:search`).catch((error: unknown) => error)).toBeInstanceOf(PollAgain);
    expect(broker.received.map(({ route }) => route)).toEqual(['POST /searches']);
  }, 60_000);

  async function brokerCheckRow(runId: string) {
    const { data } = await owner.admin
      .from('diligence_run')
      .select('diligence_broker_check (broker, state)')
      .eq('workflow_run_id', runId)
      .single()
      .throwOnError();
    return data.diligence_broker_check[0];
  }

  async function switchToMiddeskWhileBaselayerAnswers(slowRoute: string, runId: string) {
    const slow = search(runId, `${runId}:search`).catch((error: unknown) => error);
    await vi.waitFor(() => expect(broker.received.map(({ route }) => route)).toContain(slowRoute), { timeout: 10_000 });
    await connect('middesk', '/v1');
    const { data: deal } = await owner.admin.from('deal').select('firm_id').eq('id', dealId).single().throwOnError();
    await owner.admin
      .from('middesk_business')
      .upsert({ account_id: owner.accountId, firm_id: deal.firm_id!, business_id: 'mdsk-rowan' })
      .throwOnError();
    broker.routes.set('GET /v1/businesses/mdsk-rowan/orders', {
      status: 200,
      body: { data: [{ product: 'business_verification_verify', status: 'pending', completed_at: null }], has_more: false },
    });
    expect(await search(runId, `${runId}:search`).catch((error: unknown) => error)).toBeInstanceOf(PollAgain);
    return slow;
  }

  it('keeps the records of a Baselayer answer that arrives after the team switched to Middesk out of the run', async () => {
    await connect('baselayer');
    const runId = await workflowRun();
    broker.routes.set('POST /searches', { status: 202, body: { id: 'srch-6', state: 'PENDING' } });
    broker.routes.set('GET /searches/srch-6', {
      status: 200,
      body: { id: 'srch-6', state: 'COMPLETED', business: { id: 'bl-rowan', registrations: [], addresses: [{ state: 'OR' }] } },
    });
    broker.routes.set('POST /lien_searches', { status: 202, body: { id: 'lien-6', state: 'PENDING' } });
    broker.routes.set('POST /docket_searches', { status: 202, body: { id: 'dock-6', state: 'PENDING' } });
    await search(runId, `${runId}:search`).catch(() => undefined);
    await search(runId, `${runId}:search`).catch(() => undefined);
    broker.routes.set('GET /lien_searches/lien-6', {
      status: 200,
      body: { id: 'lien-6', state: 'COMPLETED', filings: [UCC_FILING] },
      delayMs: 1_500,
    });
    broker.routes.set('GET /docket_searches/dock-6', { status: 200, body: { id: 'dock-6', state: 'COMPLETED', dockets: [] } });

    const late = await switchToMiddeskWhileBaselayerAnswers('GET /lien_searches/lien-6', runId);

    expect(await late).toBeInstanceOf(PollAgain);
    const { data: run } = await owner.admin.from('diligence_run').select('id').eq('workflow_run_id', runId).single().throwOnError();
    expect(await brokerFindings(run.id)).toEqual([]);
    expect(await brokerCheckRow(runId)).toEqual({ broker: 'middesk', state: {} });
  }, 60_000);

  it('never saves a Baselayer step onto the check after the team switched to Middesk', async () => {
    await connect('baselayer');
    const runId = await workflowRun();
    broker.routes.set('POST /searches', { status: 202, body: { id: 'srch-7', state: 'PENDING' }, delayMs: 1_500 });

    const late = await switchToMiddeskWhileBaselayerAnswers('POST /searches', runId);

    expect(await late).toBeInstanceOf(PollAgain);
    expect(await brokerCheckRow(runId)).toEqual({ broker: 'middesk', state: {} });
  }, 60_000);

  it('gives up after 24 hours even while an earlier failed poll still holds the Baselayer check', async () => {
    await connect('baselayer');
    const runId = await workflowRun();
    broker.routes.set('POST /searches', { status: 202, body: { id: 'srch-8', state: 'PENDING' } });
    expect(await search(runId, `${runId}:search`).catch((error: unknown) => error)).toBeInstanceOf(PollAgain);
    vi.setSystemTime(Date.now() + 25 * HOUR_MS);
    broker.routes.set('GET /searches/srch-8', { status: 503, body: { error: 'busy' } });
    await expect(search(runId, `${runId}:search`)).rejects.toThrow('Baselayer answered 503');

    vi.setSystemTime(Date.now() + 60 * 1000);
    const output = await search(runId, `${runId}:search`);

    expect(output).toMatchObject({ skipped: { court_records: 'Baselayer did not finish within 24 hours' } });
  }, 60_000);

  it('waits instead of paying for a second Baselayer search while a recent poll may still be placing one', async () => {
    await connect('baselayer');
    const runId = await workflowRun();
    broker.routes.set('POST /searches', { status: 503, body: { error: 'busy' } });
    await expect(search(runId, `${runId}:search`)).rejects.toThrow('Baselayer answered 503');
    broker.routes.set('POST /searches', { status: 202, body: { id: 'srch-5', state: 'PENDING' } });
    broker.received.length = 0;

    vi.setSystemTime(Date.now() + 60 * 1000);
    expect(await search(runId, `${runId}:search`).catch((error: unknown) => error)).toBeInstanceOf(PollAgain);
    expect(broker.received).toEqual([]);

    vi.setSystemTime(Date.now() + 2 * 60 * 1000);
    expect(await search(runId, `${runId}:search`).catch((error: unknown) => error)).toBeInstanceOf(PollAgain);
    expect(broker.received.map(({ route }) => route)).toEqual(['POST /searches']);
  }, 60_000);

  it.each([
    ['refuses the key', { status: 401, body: { error: 'bad key' } }, 'The Baselayer key was refused; reconnect it'],
    ['finds no matching business', { status: 200, body: { id: 'srch-3', state: 'COMPLETED', business: null } }, 'Broker found no matching business'],
    ['gives up on the search', { status: 200, body: { id: 'srch-3', state: 'FAILED' } }, 'Baselayer could not search court records for this business'],
  ])('says why court records were not searched when Baselayer %s', async (_case, reply, note) => {
    await connect('baselayer');
    broker.routes.set('POST /searches', reply);
    const runId = await workflowRun();

    const output = await search(runId, `${runId}:search`);

    expect(output).toMatchObject({ skipped: { court_records: note } });
    expect(await brokerFindings(output.runId as string)).toEqual([]);
  }, 60_000);
});
