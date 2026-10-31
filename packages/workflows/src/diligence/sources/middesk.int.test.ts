import { ApplicationFailure } from '@temporalio/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeBroker } from '../../../test-support/fake-broker';
import { provisionAccount, type IntegrationAccount } from '../../../test-support/integration-harness';
import { checkMiddesk, MIDDESK_GIVE_UP_AFTER, MIDDESK_POLL_INTERVAL } from './middesk';

const network = vi.hoisted(() => ({ trustedFakeUrl: '' }));

vi.mock('../../builder/publicUrl', async (importOriginal) => {
  const { publicAddressOf, ...rest } = await importOriginal<typeof import('../../builder/publicUrl')>();
  return {
    ...rest,
    publicAddressOf: async (url: string) =>
      url.startsWith(network.trustedFakeUrl) ? { address: '127.0.0.1', family: 4 } : publicAddressOf(url),
  };
});

let broker: Awaited<ReturnType<typeof fakeBroker>>;
let received: Awaited<ReturnType<typeof fakeBroker>>['received'];
let routes: Awaited<ReturnType<typeof fakeBroker>>['routes'];
let baseUrl = '';
let team: IntegrationAccount;

const FIRM = { name: 'Rowan Fixture Plumbing', city: 'Houston', state: 'TX' };
const VERIFY = 'business_verification_verify';

beforeAll(async () => {
  team = await provisionAccount();
  broker = await fakeBroker();
  ({ received, routes } = broker);
  network.trustedFakeUrl = broker.origin;
  baseUrl = `${broker.origin}/v1`;
});

afterAll(async () => {
  broker.close();
  await team.admin.from('accounts').delete().eq('id', team.accountId);
  await team.cleanup();
});

beforeEach(() => broker.reset());

async function seedFirm(storedBusinessId?: string) {
  const { data } = await team.admin
    .from('firm')
    .insert({ account_id: team.accountId, name: FIRM.name, website: `${crypto.randomUUID()}.example` })
    .select('id')
    .single()
    .throwOnError();
  if (storedBusinessId) {
    await team.admin
      .from('middesk_business')
      .insert({ account_id: team.accountId, firm_id: data.id, business_id: storedBusinessId })
      .throwOnError();
  }
  return data.id as string;
}

async function storedBusinessOf(firmId: string) {
  const { data } = await team.admin
    .from('middesk_business')
    .select('business_id')
    .eq('firm_id', firmId)
    .single()
    .throwOnError();
  return data.business_id;
}

function list(data: unknown[], hasMore = false) {
  return { status: 200, body: { object: 'list', data, has_more: hasMore } };
}

function ordersOf(
  businessId: string,
  orders: { product: string; completed_at: string | null; status?: string }[],
) {
  routes.set(
    `GET /v1/businesses/${businessId}/orders`,
    list(
      orders.map((order, n) => ({
        object: 'order',
        id: `ord-${n}`,
        status: order.completed_at ? 'completed' : 'pending',
        ...order,
      })),
    ),
  );
}

async function seedClaim(firmId: string, claimedAt: Date) {
  await team.admin
    .from('middesk_business')
    .insert({ account_id: team.accountId, firm_id: firmId, business_id: null, claimed_at: claimedAt.toISOString() })
    .throwOnError();
}

function check(firmId: string, firm: Parameters<typeof checkMiddesk>[0]['firm'] = FIRM) {
  return checkMiddesk({
    credentials: { apiKey: 'mk-key-a', baseUrl },
    accountId: team.accountId,
    firmId,
    firm,
  });
}

const posts = () => received.filter(({ route }) => route.startsWith('POST'));

const DONE = '2026-10-30T12:00:00Z';
const ALL_DONE = [VERIFY, 'litigations', 'liens', 'bankruptcies'].map((product) => ({ product, completed_at: DONE }));
const UCC_LIEN = {
  object: 'lien',
  type: 'ucc',
  state: 'TX',
  status: 'open',
  filing_date: '2021-05-02',
  file_number: '21-0044127',
  secured_parties: [{ name: 'Harbour Equipment Finance' }],
};
const STATE_TAX_LIEN = {
  object: 'lien',
  type: 'state',
  state: 'TX',
  status: 'closed',
  filing_date: '2018-01-09',
  file_number: 'TX-TL-5521',
  secured_parties: [{ name: 'Texas Comptroller' }],
};
const LAWSUIT = {
  object: 'litigation',
  case_name: 'Harbour Supply v. Rowan Fixture Plumbing',
  case_number: '2022-CI-04411',
  case_status: 'Open',
  filing_date: '2022-02-10',
  jurisdictions: 'Harris County, TX',
};
const SETTLED_LAWSUIT = {
  ...LAWSUIT,
  case_name: 'Rowan Fixture Plumbing v. Gulf Pipe Co.',
  case_number: '2019-CI-01102',
  case_status: 'Closed',
  filing_date: '2019-06-12',
};
const CHAPTER_11 = {
  object: 'bankruptcy',
  case_number: '20-31455',
  chapter: 11,
  court: 'Bankr. S.D. Tex.',
  filing_date: '2020-03-01',
};

describe('checkMiddesk', () => {
  it('is polled every 5 minutes and given up after 24 hours', () => {
    expect({ MIDDESK_POLL_INTERVAL, MIDDESK_GIVE_UP_AFTER }).toEqual({
      MIDDESK_POLL_INTERVAL: '5 minutes',
      MIDDESK_GIVE_UP_AFTER: '24 hours',
    });
  });

  it.each([
    [{ name: 'Rowan Fixture Plumbing', city: null, state: 'TX' }],
    [{ name: 'Rowan Fixture Plumbing', city: 'Houston', state: null }],
  ])('does not check a firm without a city and state, calling nobody', async (firm) => {
    const firmId = await seedFirm();

    expect(await check(firmId, firm)).toEqual({ status: 'not_checked' });
    expect(received).toEqual([]);
  });

  it('orders a Verify with business litigations and bankruptcies for a firm Middesk has never seen, remembers it, and waits', async () => {
    const firmId = await seedFirm();
    routes.set('GET /v1/businesses', list([]));
    routes.set('POST /v1/businesses', { status: 200, body: { object: 'business', id: 'mdsk-new', status: 'pending' } });
    ordersOf('mdsk-new', [
      { product: VERIFY, completed_at: null },
      { product: 'litigations', completed_at: null },
      { product: 'bankruptcies', completed_at: null },
    ]);

    expect(await check(firmId)).toEqual({ status: 'pending' });
    expect(received[0]).toMatchObject({ route: 'GET /v1/businesses' });
    expect(received[0]!.query).toEqual({ external_id: firmId });
    expect(posts()).toEqual([
      {
        route: 'POST /v1/businesses',
        query: {},
        headers: expect.objectContaining({ authorization: `Basic ${Buffer.from('mk-key-a:').toString('base64')}` }),
        body: {
          name: 'Rowan Fixture Plumbing',
          external_id: firmId,
          addresses: [{ city: 'Houston', state: 'TX' }],
          orders: [{ product: VERIFY }, { product: 'litigations' }, { product: 'bankruptcies' }],
        },
      },
    ]);
    expect(await storedBusinessOf(firmId)).toBe('mdsk-new');
  });

  it('adopts the business an earlier run created for this firm instead of paying for another', async () => {
    const firmId = await seedFirm();
    routes.set('GET /v1/businesses', list([{ object: 'business', id: 'mdsk-orphan', external_id: firmId }]));
    ordersOf('mdsk-orphan', [
      { product: VERIFY, completed_at: null },
      { product: 'litigations', completed_at: null },
      { product: 'bankruptcies', completed_at: null },
    ]);

    expect(await check(firmId)).toEqual({ status: 'pending' });
    expect(posts()).toEqual([]);
    expect(await storedBusinessOf(firmId)).toBe('mdsk-orphan');
  });

  it('orders nothing new while Verify runs', async () => {
    const firmId = await seedFirm('mdsk-waiting');
    ordersOf('mdsk-waiting', [
      { product: VERIFY, completed_at: null },
      { product: 'litigations', completed_at: null },
      { product: 'bankruptcies', completed_at: null },
    ]);

    expect(await check(firmId)).toEqual({ status: 'pending' });
    expect(received.map(({ route }) => route)).toEqual(['GET /v1/businesses/mdsk-waiting/orders']);
  });

  it('orders the business lien search, and any legal search the business lacks, once Verify finishes', async () => {
    const firmId = await seedFirm('mdsk-verified');
    ordersOf('mdsk-verified', [
      { product: VERIFY, completed_at: DONE },
      { product: 'litigations', completed_at: null },
    ]);
    routes.set('POST /v1/businesses/mdsk-verified/orders', { status: 200, body: { object: 'order', id: 'ord-new' } });

    expect(await check(firmId)).toEqual({ status: 'pending' });
    expect(posts().map(({ route, body }) => ({ route, body }))).toEqual([
      { route: 'POST /v1/businesses/mdsk-verified/orders', body: { product: 'liens' } },
      { route: 'POST /v1/businesses/mdsk-verified/orders', body: { product: 'bankruptcies' } },
    ]);
  });

  it('waits until liens, litigations and bankruptcies all finish', async () => {
    const firmId = await seedFirm('mdsk-partway');
    ordersOf('mdsk-partway', [...ALL_DONE.slice(0, 3), { product: 'bankruptcies', completed_at: null }]);

    expect(await check(firmId)).toEqual({ status: 'pending' });
    expect(posts()).toEqual([]);
  });

  it("reuses the firm's Middesk business, reading its liens, litigations and bankruptcies without a new order", async () => {
    const firmId = await seedFirm('mdsk-known');
    ordersOf('mdsk-known', ALL_DONE);
    routes.set('GET /v1/businesses/mdsk-known/liens', list([UCC_LIEN, STATE_TAX_LIEN]));
    routes.set('GET /v1/businesses/mdsk-known/litigations', list([LAWSUIT, SETTLED_LAWSUIT]));
    routes.set('GET /v1/businesses/mdsk-known/bankruptcies', list([CHAPTER_11]));

    expect(await check(firmId)).toEqual({
      status: 'done',
      records: [
        {
          source: 'middesk',
          kind: 'ucc',
          title: 'Harbour Equipment Finance',
          reference: '21-0044127',
          jurisdiction: 'TX',
          filedOn: '2021-05-02',
          open: true,
          raw: UCC_LIEN,
        },
        {
          source: 'middesk',
          kind: 'tax_lien',
          title: 'Texas Comptroller',
          reference: 'TX-TL-5521',
          jurisdiction: 'TX',
          filedOn: '2018-01-09',
          open: false,
          raw: STATE_TAX_LIEN,
        },
        {
          source: 'middesk',
          kind: 'litigation',
          title: 'Harbour Supply v. Rowan Fixture Plumbing',
          reference: '2022-CI-04411',
          jurisdiction: 'Harris County, TX',
          filedOn: '2022-02-10',
          open: true,
          raw: LAWSUIT,
        },
        {
          source: 'middesk',
          kind: 'litigation',
          title: 'Rowan Fixture Plumbing v. Gulf Pipe Co.',
          reference: '2019-CI-01102',
          jurisdiction: 'Harris County, TX',
          filedOn: '2019-06-12',
          open: false,
          raw: SETTLED_LAWSUIT,
        },
        {
          source: 'middesk',
          kind: 'bankruptcy',
          title: 'Chapter 11 bankruptcy',
          reference: '20-31455',
          jurisdiction: 'Bankr. S.D. Tex.',
          filedOn: '2020-03-01',
          open: null,
          raw: CHAPTER_11,
        },
      ],
    });
    expect(posts()).toEqual([]);
  });

  it('reads every page of a Middesk list', async () => {
    const firmId = await seedFirm('mdsk-paged');
    ordersOf('mdsk-paged', ALL_DONE);
    routes.set('GET /v1/businesses/mdsk-paged/liens?page=1', list([UCC_LIEN], true));
    routes.set('GET /v1/businesses/mdsk-paged/liens?page=2', list([STATE_TAX_LIEN]));
    routes.set('GET /v1/businesses/mdsk-paged/litigations', list([]));
    routes.set('GET /v1/businesses/mdsk-paged/bankruptcies', list([]));

    expect(await check(firmId)).toMatchObject({
      status: 'done',
      records: [{ reference: '21-0044127' }, { reference: 'TX-TL-5521' }],
    });
  });

  it('keeps a lien or case of a type or status it does not know, labelled unknown', async () => {
    const firmId = await seedFirm('mdsk-odd');
    const oddLien = { ...UCC_LIEN, type: 'mechanics', status: 'disputed' };
    const oddCase = { ...LAWSUIT, case_status: 'Stayed' };
    ordersOf('mdsk-odd', ALL_DONE);
    routes.set('GET /v1/businesses/mdsk-odd/liens', list([oddLien]));
    routes.set('GET /v1/businesses/mdsk-odd/litigations', list([oddCase]));
    routes.set('GET /v1/businesses/mdsk-odd/bankruptcies', list([]));

    expect(await check(firmId)).toMatchObject({
      status: 'done',
      records: [
        { kind: 'unknown', open: null, raw: oddLien },
        { kind: 'litigation', open: null, raw: oddCase },
      ],
    });
  });

  it('retries when Middesk says to slow down', async () => {
    const firmId = await seedFirm('mdsk-busy');
    routes.set('GET /v1/businesses/mdsk-busy/orders', { status: 429, body: { error: 'rate limited' } });

    const error = await check(firmId).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ApplicationFailure);
  });

  it('says the key was refused when Middesk rejects it', async () => {
    const firmId = await seedFirm('mdsk-refused');
    routes.set('GET /v1/businesses/mdsk-refused/orders', { status: 401, body: { error: 'unauthorized' } });

    expect(await check(firmId)).toEqual({ status: 'refused' });
  });
  it('creates one Middesk business when two runs check the same firm at once', async () => {
    const firmId = await seedFirm();
    routes.set('GET /v1/businesses', { ...list([]), delayMs: 200 });
    routes.set('POST /v1/businesses', { status: 200, body: { object: 'business', id: 'mdsk-once', status: 'pending' } });
    ordersOf('mdsk-once', [{ product: VERIFY, completed_at: null }]);

    expect(await Promise.all([check(firmId), check(firmId)])).toEqual([{ status: 'pending' }, { status: 'pending' }]);
    expect(posts().filter(({ route }) => route === 'POST /v1/businesses')).toHaveLength(1);
    expect(await storedBusinessOf(firmId)).toBe('mdsk-once');
  });

  it('waits, creating nothing, while another run holds a fresh claim on the firm', async () => {
    const firmId = await seedFirm();
    await seedClaim(firmId, new Date());

    expect(await check(firmId)).toEqual({ status: 'pending' });
    expect(received).toEqual([]);
  });

  it('takes over a claim a crashed run left more than 2 minutes ago', async () => {
    const firmId = await seedFirm();
    await seedClaim(firmId, new Date(Date.now() - 3 * 60_000));
    routes.set('GET /v1/businesses', list([]));
    routes.set('POST /v1/businesses', { status: 200, body: { object: 'business', id: 'mdsk-taken', status: 'pending' } });
    ordersOf('mdsk-taken', [{ product: VERIFY, completed_at: null }]);

    expect(await check(firmId)).toEqual({ status: 'pending' });
    expect(posts().map(({ route }) => route)).toEqual(['POST /v1/businesses']);
    expect(await storedBusinessOf(firmId)).toBe('mdsk-taken');
  });

  it('does not check a business whose lien, litigation or bankruptcy search Middesk rejected', async () => {
    const firmId = await seedFirm('mdsk-rejected');
    ordersOf('mdsk-rejected', [
      ...ALL_DONE.slice(0, 2),
      { product: 'liens', completed_at: null, status: 'rejected' },
      { product: 'bankruptcies', completed_at: null },
    ]);

    expect(await check(firmId)).toEqual({ status: 'not_checked' });
  });

  it('still reads the records when only Verify was rejected', async () => {
    const firmId = await seedFirm('mdsk-verify-rejected');
    ordersOf('mdsk-verify-rejected', [{ ...ALL_DONE[0]!, status: 'rejected' }, ...ALL_DONE.slice(1)]);
    routes.set('GET /v1/businesses/mdsk-verify-rejected/liens', list([]));
    routes.set('GET /v1/businesses/mdsk-verify-rejected/litigations', list([]));
    routes.set('GET /v1/businesses/mdsk-verify-rejected/bankruptcies', list([]));

    expect(await check(firmId)).toEqual({ status: 'done', records: [] });
  });
});
