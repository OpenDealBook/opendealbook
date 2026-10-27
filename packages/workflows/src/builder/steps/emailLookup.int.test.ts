import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { fakeAiProvider } from '../../../test-support/fake-ai-provider';
import { provisionAccount, type IntegrationAccount } from '../../../test-support/integration-harness';
import { CapReached } from '../caps';
import { emailLookup } from './emailLookup';

const network = vi.hoisted(() => ({ trustedFakeUrl: '' }));

vi.mock('../publicUrl', async (importOriginal) => {
  const { publicAddressOf } = await importOriginal<typeof import('../publicUrl')>();
  return {
    publicAddressOf: async (url: string) =>
      url.startsWith(network.trustedFakeUrl) ? { address: '127.0.0.1', family: 4 } : publicAddressOf(url),
  };
});

let owner: IntegrationAccount;
let apify: Awaited<ReturnType<typeof fakeAiProvider>>;
let firmId: string;

function lookUp(idempotencyKey: string) {
  return emailLookup.execute({
    context: { accountId: owner.accountId, runId: 'run-1', idempotencyKey },
    config: { firmId },
    input: {},
  });
}

async function lookups() {
  const { data } = await owner.admin
    .from('paid_lookup')
    .select('kind, provider, cost_cents, outcome, result, firm_id')
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
  apify = await fakeAiProvider({ status: 200, body: [] });
  network.trustedFakeUrl = apify.baseUrl;
  const { data: firm } = await owner.admin
    .from('firm')
    .insert({ account_id: owner.accountId, name: 'Rowan Fixture Plumbing', website: 'https://rowanfixtureplumbing.example' })
    .select('id')
    .single()
    .throwOnError();
  firmId = firm.id;
  await owner.admin
    .from('contact')
    .insert({ account_id: owner.accountId, firm_id: firmId, name: 'Known Owner', email: 'OWNER@RowanFixturePlumbing.example' })
    .throwOnError();
});

async function firmContacts() {
  const { data } = await owner.admin
    .from('contact')
    .select('name, email, source')
    .eq('firm_id', firmId)
    .throwOnError();
  return data.sort((a: { email: string }, b: { email: string }) => a.email.toLowerCase().localeCompare(b.email.toLowerCase()));
}

afterAll(async () => {
  apify.close();
  await owner.admin.from('accounts').delete().eq('id', owner.accountId);
  await owner.cleanup();
});

describe('email_lookup step (integration)', () => {
  it('fails at once, spending nothing, when the team has no email lookup provider', async () => {
    await setLookupCap(5);

    await expect(lookUp('run-1:emails:0')).rejects.toMatchObject({
      nonRetryable: true,
      message: 'Connect an email lookup provider first',
    });
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

    await expect(lookUp('run-1:emails:0')).rejects.toBeInstanceOf(CapReached);
    expect(apify.received).toEqual([]);
    expect(await lookups()).toEqual([]);
  });

  it("runs the team's actor on the firm website, records the paid lookup and keeps the emails for this team", async () => {
    await setLookupCap(5);
    apify.reply.body = [
      { url: 'https://rowanfixtureplumbing.example', emails: ['Owner@RowanFixturePlumbing.example', 'office@rowanfixtureplumbing.example'] },
      {
        url: 'https://rowanfixtureplumbing.example/contact',
        emails: [
          'owner@rowanfixtureplumbing.example',
          'Sales@mail.rowanfixtureplumbing.example',
          'info@rowanfixtureplumbing.example',
          'noreply@rowanfixtureplumbing.example',
          'No-Reply@rowanfixtureplumbing.example',
          'postmaster@rowanfixtureplumbing.example',
          'owner@othersite.example',
          'someone@notrowanfixtureplumbing.example',
        ],
      },
    ];

    const output = await lookUp('run-1:emails:0');

    expect(output).toEqual({
      outcome: 'found',
      emails: [
        'owner@rowanfixtureplumbing.example',
        'office@rowanfixtureplumbing.example',
        'sales@mail.rowanfixtureplumbing.example',
        'info@rowanfixtureplumbing.example',
      ],
    });
    expect(apify.received).toHaveLength(1);
    expect(apify.received[0]!.path).toBe('/v1/acts/acme~site-contacts/run-sync-get-dataset-items');
    expect(apify.received[0]!.headers.authorization).toBe('Bearer apify-team-key');
    expect(apify.received[0]!.body).toEqual({ startUrls: [{ url: 'https://rowanfixtureplumbing.example' }] });
    expect(await lookups()).toEqual([
      {
        kind: 'email_lookup',
        provider: 'apify',
        cost_cents: 0,
        outcome: 'found',
        result: apify.reply.body,
        firm_id: firmId,
      },
    ]);
    const { data: emails } = await owner.admin
      .from('firm_email')
      .select('account_id, email, provider')
      .eq('firm_id', firmId)
      .order('email')
      .throwOnError();
    expect(emails).toEqual([
      { account_id: owner.accountId, email: 'info@rowanfixtureplumbing.example', provider: 'apify' },
      { account_id: owner.accountId, email: 'office@rowanfixtureplumbing.example', provider: 'apify' },
      { account_id: owner.accountId, email: 'owner@rowanfixtureplumbing.example', provider: 'apify' },
      { account_id: owner.accountId, email: 'sales@mail.rowanfixtureplumbing.example', provider: 'apify' },
    ]);
    expect(await firmContacts()).toEqual([
      { name: null, email: 'info@rowanfixtureplumbing.example', source: 'email_lookup' },
      { name: null, email: 'office@rowanfixtureplumbing.example', source: 'email_lookup' },
      { name: 'Known Owner', email: 'OWNER@RowanFixturePlumbing.example', source: 'manual' },
      { name: null, email: 'sales@mail.rowanfixtureplumbing.example', source: 'email_lookup' },
    ]);
  });

  it('returns the recorded lookup without paying again when the step is retried', async () => {
    apify.received.length = 0;

    expect(await lookUp('run-1:emails:0')).toEqual({
      outcome: 'found',
      emails: [
        'owner@rowanfixtureplumbing.example',
        'office@rowanfixtureplumbing.example',
        'sales@mail.rowanfixtureplumbing.example',
        'info@rowanfixtureplumbing.example',
      ],
    });
    expect(apify.received).toEqual([]);
    expect(await lookups()).toHaveLength(1);
    expect(await firmContacts()).toHaveLength(4);
  });

  it("records not found when the actor finds no emails at the firm's own domain", async () => {
    apify.reply.body = [
      { url: 'https://rowanfixtureplumbing.example', emails: ['noreply@rowanfixtureplumbing.example', 'owner@othersite.example'] },
    ];

    expect(await lookUp('run-1:emails:1')).toEqual({ outcome: 'not_found', emails: [] });
    expect((await lookups())[1]).toMatchObject({ outcome: 'not_found', result: apify.reply.body });
  });

  it('fails at once, spending nothing, when the firm has no website', async () => {
    const { data: firm } = await owner.admin
      .from('firm')
      .insert({ account_id: owner.accountId, name: 'Offline Masonry' })
      .select('id')
      .single()
      .throwOnError();
    apify.received.length = 0;

    await expect(
      emailLookup.execute({
        context: { accountId: owner.accountId, runId: 'run-1', idempotencyKey: 'run-1:emails:offline' },
        config: { firmId: firm.id },
        input: {},
      }),
    ).rejects.toMatchObject({ nonRetryable: true, message: 'This firm has no website to look up' });
    expect(apify.received).toEqual([]);
    expect(await lookups()).toHaveLength(2);
  });

  it('records a failed lookup and lets the step retry when the provider errors', async () => {
    apify.reply.status = 502;
    apify.reply.body = { error: { type: 'upstream', message: 'Bad gateway' } };

    const failure = await lookUp('run-1:emails:2').catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toMatchObject({ nonRetryable: true });
    expect((await lookups())[2]).toMatchObject({
      outcome: 'failed',
      result: { status: 502, body: { error: { type: 'upstream', message: 'Bad gateway' } } },
    });

    apify.reply.status = 200;
    apify.reply.body = [{ emails: ['owner@rowanfixtureplumbing.example'] }];
    expect(await lookUp('run-1:emails:2')).toEqual({ outcome: 'found', emails: ['owner@rowanfixtureplumbing.example'] });
    expect(await lookups()).toHaveLength(3);
  });

  it('records a failed lookup and fails at once when the provider refuses the request', async () => {
    await setLookupCap(20);
    apify.reply.status = 401;
    apify.reply.body = { error: { type: 'token-not-valid' } };

    await expect(lookUp('run-1:emails:3')).rejects.toMatchObject({
      nonRetryable: true,
      message: 'The email lookup provider answered 401',
    });
    expect((await lookups())[3]).toMatchObject({
      outcome: 'failed',
      result: { status: 401, body: { error: { type: 'token-not-valid' } } },
    });
  });

  it('rejects, keeping the lookup failed and storing no emails, when the actor answers in an unexpected shape', async () => {
    apify.reply.status = 200;
    apify.reply.body = { data: 'unexpected' };
    const emailsBefore = await owner.admin.from('firm_email').select('email').eq('firm_id', firmId).throwOnError();

    const failure = await lookUp('run-1:emails:4').catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toMatchObject({ nonRetryable: true });
    expect((await lookups())[4]).toMatchObject({ outcome: 'failed', result: {} });
    const emailsAfter = await owner.admin.from('firm_email').select('email').eq('firm_id', firmId).throwOnError();
    expect(emailsAfter.data).toEqual(emailsBefore.data);
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

    const failure = await lookUp(`run-1:emails:html-${status}`).catch((error: unknown) => error);

    server.close();
    network.trustedFakeUrl = apify.baseUrl;
    await pointProviderAt(apify.baseUrl);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as { nonRetryable?: boolean }).nonRetryable === true).toBe(failsAtOnce);
    expect((await lookups()).at(-1)).toMatchObject({
      outcome: 'failed',
      result: { status, text: '<html>gateway</html>' },
    });
  });

  it('refuses at once to call a provider address that is not public', async () => {
    await pointProviderAt('https://10.0.0.8/v2');
    apify.received.length = 0;

    await expect(lookUp('run-1:emails:6')).rejects.toMatchObject({
      nonRetryable: true,
      message: 'Use a public HTTPS base URL',
    });
    await pointProviderAt(apify.baseUrl);
    expect(apify.received).toEqual([]);
  });

  async function firmAt(website: string) {
    const { data: firm } = await owner.admin
      .from('firm')
      .insert({ account_id: owner.accountId, name: `Firm at ${website}`, website })
      .select('id')
      .single()
      .throwOnError();
    return firm.id as string;
  }

  function lookUpFirm(idempotencyKey: string, id: string) {
    return emailLookup.execute({
      context: { accountId: owner.accountId, runId: 'run-1', idempotencyKey },
      config: { firmId: id },
      input: {},
    });
  }

  it('matches emails on the registrable domain of a multi-part public suffix', async () => {
    await pointProviderAt(apify.baseUrl);
    apify.reply.status = 200;
    apify.reply.body = [
      {
        emails: ['owner@harbourjoinery-fixture.co.uk', 'sales@shop.harbourjoinery-fixture.co.uk', 'someone@otherjoinery-fixture.co.uk'],
      },
    ];

    expect(await lookUpFirm('run-1:emails:co-uk', await firmAt('https://www.harbourjoinery-fixture.co.uk'))).toEqual({
      outcome: 'found',
      emails: ['owner@harbourjoinery-fixture.co.uk', 'sales@shop.harbourjoinery-fixture.co.uk'],
    });
  });

  it('treats a website saved without a scheme as https', async () => {
    apify.received.length = 0;
    apify.reply.body = [{ emails: ['owner@tinianroofing.example'] }];

    expect(await lookUpFirm('run-1:emails:bare', await firmAt('tinianroofing.example'))).toEqual({
      outcome: 'found',
      emails: ['owner@tinianroofing.example'],
    });
    expect(apify.received[0]!.body).toEqual({ startUrls: [{ url: 'https://tinianroofing.example' }] });
  });
});
