import { ApplicationFailure } from '@temporalio/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeBroker } from '../../../test-support/fake-broker';
import { checkBaselayer, type BaselayerCheck } from './baselayer';

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

beforeAll(async () => {
  broker = await fakeBroker();
  ({ received, routes } = broker);
  baseUrl = broker.origin;
  network.trustedFakeUrl = broker.origin;
});

afterAll(() => broker.close());

beforeEach(() => broker.reset());

const FIRM = { name: 'Rowan Fixture Plumbing', city: 'Houston', state: 'TX' };
const ROWAN_BUSINESS = {
  id: 'bl-biz-rowan',
  name: 'ROWAN FIXTURE PLUMBING LLC',
  registrations: [
    { state: 'DE', registration_type: 'domestic' },
    { state: 'TX', registration_type: 'foreign' },
  ],
  addresses: [{ state: 'TX' }, { state: 'OK' }, { state: 'TX' }],
};
const UCC_FILING = {
  id: 'fil-1',
  state: 'DE',
  filing_number: '2021 1234567',
  filing_type: 'consensual.ucc',
  filing_date: '2021-05-02',
  status: 'Active',
  parties: [
    { role: 'debtor', name: 'ROWAN FIXTURE PLUMBING LLC', type: 'Business' },
    { role: 'secured_party', name: 'Harbour Equipment Finance', type: 'Business' },
  ],
};
const IRS_LIEN = {
  id: 'fil-2',
  state: 'TX',
  filing_number: 'TX-88231',
  filing_type: 'tax.federal_irs',
  filing_date: '2019-08-14',
  status: 'Terminated',
  parties: [
    { role: 'secured_party', name: 'Internal Revenue Service', type: 'Business' },
    { role: 'debtor', name: 'ROWAN FIXTURE PLUMBING LLC', type: 'Business' },
  ],
};
const LAWSUIT = {
  id: 'dk-1',
  title: 'Harbour Supply v. Rowan Fixture Plumbing',
  docket_number: '2022-CI-04411',
  court: 'Harris County District Court',
  date_filed: '2022-02-10',
  normalized_status: 'open',
  is_bankruptcy: false,
};
const CHAPTER_11 = {
  id: 'dk-2',
  title: 'In re Rowan Fixture Plumbing',
  docket_number: '20-31455',
  court: 'Bankr. S.D. Tex.',
  date_filed: '2020-03-01',
  normalized_status: 'closed',
  is_bankruptcy: true,
};

function check(state: BaselayerCheck, firm: Parameters<typeof checkBaselayer>[0]['firm'] = FIRM) {
  return checkBaselayer({ credentials: { apiKey: 'bl-key-a', baseUrl }, firm, check: state });
}

describe('checkBaselayer', () => {
  it('searches for the business by name and city with the team key, and waits while the search runs', async () => {
    routes.set('POST /searches', { status: 202, body: { id: 'srch-1', state: 'PENDING' } });

    expect(await check({ step: 'search' })).toEqual({
      status: 'pending',
      check: { step: 'searching', searchId: 'srch-1' },
    });
    expect(received).toEqual([
      expect.objectContaining({
        route: 'POST /searches',
        headers: expect.objectContaining({ 'x-api-key': 'bl-key-a' }),
        body: { name: 'Rowan Fixture Plumbing', address: 'Houston, TX' },
      }),
    ]);
  });

  it('starts no second search while the first one runs', async () => {
    routes.set('GET /searches/srch-1', { status: 200, body: { id: 'srch-1', state: 'EXECUTING' } });

    expect(await check({ step: 'searching', searchId: 'srch-1' })).toEqual({
      status: 'pending',
      check: { step: 'searching', searchId: 'srch-1' },
    });
    expect(received.map(({ route }) => route)).toEqual(['GET /searches/srch-1']);
  });

  it('reports that Baselayer found no matching business, ordering nothing', async () => {
    routes.set('GET /searches/srch-1', { status: 200, body: { id: 'srch-1', state: 'COMPLETED', business: null } });

    expect(await check({ step: 'searching', searchId: 'srch-1' })).toEqual({ status: 'no_match' });
    expect(received.map(({ route }) => route)).toEqual(['GET /searches/srch-1']);
  });

  it('searches liens in the home state and every state the business operates in, and the business dockets, never its people', async () => {
    routes.set('GET /searches/srch-1', {
      status: 200,
      body: { id: 'srch-1', state: 'COMPLETED', business: ROWAN_BUSINESS },
    });
    routes.set('POST /lien_searches', { status: 202, body: { id: 'lien-1', state: 'PENDING' } });
    routes.set('POST /docket_searches', { status: 202, body: { id: 'dock-1', state: 'PENDING' } });

    expect(await check({ step: 'searching', searchId: 'srch-1' })).toEqual({
      status: 'pending',
      check: { step: 'records', lienSearchId: 'lien-1', docketSearchId: 'dock-1' },
    });
    const lienOrder = received.find(({ route }) => route === 'POST /lien_searches')!;
    const docketOrder = received.find(({ route }) => route === 'POST /docket_searches')!;
    expect(lienOrder.body).toEqual({ business_id: 'bl-biz-rowan', search_states: ['DE', 'TX', 'OK'] });
    expect(docketOrder.body).toEqual({ business_id: 'bl-biz-rowan', options: ['Order.Litigations', 'Order.Bankruptcy'] });
  });

  it('waits until both the lien and docket searches finish', async () => {
    routes.set('GET /lien_searches/lien-1', { status: 200, body: { id: 'lien-1', state: 'COMPLETED', filings: [] } });
    routes.set('GET /docket_searches/dock-1', { status: 200, body: { id: 'dock-1', state: 'EXECUTING' } });
    const records = { step: 'records', lienSearchId: 'lien-1', docketSearchId: 'dock-1' } as const;

    expect(await check(records)).toEqual({ status: 'pending', check: records });
  });

  it('returns UCC filings, tax liens, lawsuits and bankruptcies once both searches finish', async () => {
    routes.set('GET /lien_searches/lien-1', {
      status: 200,
      body: { id: 'lien-1', state: 'COMPLETED', filings: [UCC_FILING, IRS_LIEN] },
    });
    routes.set('GET /docket_searches/dock-1', {
      status: 200,
      body: { id: 'dock-1', state: 'COMPLETED', dockets: [LAWSUIT, CHAPTER_11] },
    });

    expect(await check({ step: 'records', lienSearchId: 'lien-1', docketSearchId: 'dock-1' })).toEqual({
      status: 'done',
      records: [
        {
          source: 'baselayer',
          kind: 'ucc',
          title: 'Harbour Equipment Finance',
          reference: '2021 1234567',
          jurisdiction: 'DE',
          filedOn: '2021-05-02',
          open: true,
          raw: UCC_FILING,
        },
        {
          source: 'baselayer',
          kind: 'tax_lien',
          title: 'Internal Revenue Service',
          reference: 'TX-88231',
          jurisdiction: 'TX',
          filedOn: '2019-08-14',
          open: false,
          raw: IRS_LIEN,
        },
        {
          source: 'baselayer',
          kind: 'litigation',
          title: 'Harbour Supply v. Rowan Fixture Plumbing',
          reference: '2022-CI-04411',
          jurisdiction: 'Harris County District Court',
          filedOn: '2022-02-10',
          open: true,
          raw: LAWSUIT,
        },
        {
          source: 'baselayer',
          kind: 'bankruptcy',
          title: 'In re Rowan Fixture Plumbing',
          reference: '20-31455',
          jurisdiction: 'Bankr. S.D. Tex.',
          filedOn: '2020-03-01',
          open: false,
          raw: CHAPTER_11,
        },
      ],
    });
  });

  it('says the key was refused when Baselayer rejects it', async () => {
    routes.set('POST /searches', { status: 401, body: { error: 'invalid api key' } });

    expect(await check({ step: 'search' })).toEqual({ status: 'refused' });
  });
  it.each([
    [{ name: 'Rowan Fixture Plumbing', city: null, state: 'TX' }],
    [{ name: 'Rowan Fixture Plumbing', city: 'Houston', state: null }],
  ])('does not check a firm without a city and state, calling nobody', async (firm) => {
    expect(await check({ step: 'search' }, firm)).toEqual({ status: 'not_checked' });
    expect(received).toEqual([]);
  });

  it('does not check a business whose Baselayer search failed', async () => {
    routes.set('GET /searches/srch-1', { status: 200, body: { id: 'srch-1', state: 'FAILED' } });

    expect(await check({ step: 'searching', searchId: 'srch-1' })).toEqual({ status: 'not_checked' });
  });

  it('does not check a business whose docket search was cancelled', async () => {
    routes.set('GET /lien_searches/lien-1', { status: 200, body: { id: 'lien-1', state: 'COMPLETED', filings: [] } });
    routes.set('GET /docket_searches/dock-1', { status: 200, body: { id: 'dock-1', state: 'CANCELLED' } });

    expect(await check({ step: 'records', lienSearchId: 'lien-1', docketSearchId: 'dock-1' })).toEqual({
      status: 'not_checked',
    });
  });

  it('keeps a filing of a type or status it does not know, labelled unknown', async () => {
    const oddFiling = { ...UCC_FILING, filing_type: 'mechanics.lien', status: 'Pending Review' };
    const oddDocket = { ...LAWSUIT, normalized_status: 'stayed' };
    routes.set('GET /lien_searches/lien-1', {
      status: 200,
      body: { id: 'lien-1', state: 'COMPLETED', filings: [oddFiling] },
    });
    routes.set('GET /docket_searches/dock-1', {
      status: 200,
      body: { id: 'dock-1', state: 'COMPLETED', dockets: [oddDocket] },
    });

    const outcome = await check({ step: 'records', lienSearchId: 'lien-1', docketSearchId: 'dock-1' });

    expect(outcome).toMatchObject({
      status: 'done',
      records: [
        { kind: 'unknown', reference: '2021 1234567', open: null, raw: oddFiling },
        { kind: 'litigation', reference: '2022-CI-04411', open: null, raw: oddDocket },
      ],
    });
  });

  it('retries when Baselayer says to slow down', async () => {
    routes.set('POST /searches', { status: 429, body: { error: 'rate limited' } });

    const error = await check({ step: 'search' }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ApplicationFailure);
  });
  it('does not check a business with no home state and no address, ordering nothing', async () => {
    routes.set('GET /searches/srch-1', {
      status: 200,
      body: {
        id: 'srch-1',
        state: 'COMPLETED',
        business: { ...ROWAN_BUSINESS, registrations: [{ state: 'TX', registration_type: 'foreign' }], addresses: [] },
      },
    });

    expect(await check({ step: 'searching', searchId: 'srch-1' })).toEqual({ status: 'not_checked' });
    expect(received.map(({ route }) => route)).toEqual(['GET /searches/srch-1']);
  });

  it('gives up for good when Baselayer refuses the request itself', async () => {
    routes.set('POST /searches', { status: 422, body: { error: 'address is required' } });

    await expect(check({ step: 'search' })).rejects.toMatchObject({
      message: 'Baselayer answered 422',
      nonRetryable: true,
    });
  });

  it('gives up for good when Baselayer answers with something that is not JSON', async () => {
    routes.set('POST /searches', { status: 200, body: '<html>maintenance</html>' });

    await expect(check({ step: 'search' })).rejects.toMatchObject({
      message: 'Baselayer answered with something that is not JSON',
      nonRetryable: true,
    });
  });
});
