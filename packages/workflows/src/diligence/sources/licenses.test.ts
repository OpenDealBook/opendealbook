import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { ApplicationFailure } from '@temporalio/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type LicenseRegistryUrls, searchLicenses } from './licenses';

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/licenses/${name}.json`, import.meta.url), 'utf8'));
}

const DATASETS: Record<string, string> = {
  '/resource/7358-krk7.json': 'tx',
  '/resource/pzzh-kp68.json': 'il',
  '/resource/7s5z-vewr.json': 'co',
  '/resource/ngch-56tr.json': 'ct',
  '/resource/m8qx-ubtq.json': 'wa',
};

interface Received {
  path: string;
  query: Record<string, string>;
}

const registries = {
  received: [] as Received[],
  reply: (path: string, _query: Record<string, string>): { status: number; body: unknown } => ({
    status: 200,
    body: path === '/api/' ? fixture('nppes') : fixture(DATASETS[path]!),
  }),
  close: () => {},
};
let urls: LicenseRegistryUrls;

beforeAll(async () => {
  const server = createServer((request, response) => {
    const url = new URL(request.url!, 'http://fake');
    const query = Object.fromEntries(url.searchParams);
    registries.received.push({ path: url.pathname, query });
    const { status, body } = registries.reply(url.pathname, query);
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  urls = { NPPES: origin, TX: origin, IL: origin, CO: origin, CT: origin, WA: origin };
  registries.close = () => server.close();
});

afterAll(() => registries.close());

const defaultReply = registries.reply;
beforeEach(() => {
  registries.received.length = 0;
  registries.reply = defaultReply;
});

const HARBOR = { key: 'firm', name: 'Harbor Fixture Dental, PLLC' };

function HARBOR_WORDS(column: string) {
  return ['HARBOR', 'FIXTURE', 'DENTAL'].map((word) => `upper(replace(${column}, "'", "")) like '%${word}%'`).join(' AND ');
}

function search(state: string) {
  return searchLicenses({ business: HARBOR, state }, urls);
}

describe('searchLicenses for a business in a state with no license data', () => {
  it('searches only NPPES and notes that the state was not checked', async () => {
    const result = await search('NV');

    expect(registries.received.map((request) => request.path)).toEqual(['/api/']);
    expect(result.notChecked).toEqual(['License data is not available for NV']);
  });
});

describe('searchLicenses against NPPES', () => {
  it("asks NPPES for organizations in the business's state whose name starts with its first word", async () => {
    await search('NV');

    expect(registries.received[0]!.query).toEqual({
      version: '2.1',
      enumeration_type: 'NPI-2',
      organization_name: 'HARBOR*',
      state: 'NV',
      limit: '200',
      skip: '0',
    });
  });

  it('keeps only organizations whose normalized name is exactly the business name', async () => {
    const { candidates } = await search('NV');

    expect(candidates).toEqual([
      {
        subjectKey: 'firm',
        source: 'licenses',
        registry: 'NPPES',
        licenseeName: 'HARBOR FIXTURE DENTAL, PLLC',
        licenseNumber: '1999000017',
        licenseType: 'Dentist, General Practice',
        status: 'Active',
        expiresOn: null,
        raw: expect.objectContaining({ number: '1999000017' }),
      },
    ]);
  });
});

describe('searchLicenses for a business in a state with live license data', () => {
  it("asks the state's open-data set for every license whose business name holds each word of the name, a page at a time", async () => {
    await search('TX');

    expect(registries.received.find((request) => request.path === '/resource/7358-krk7.json')!.query).toEqual({
      $where: `(${HARBOR_WORDS('business_name')})`,
      $order: ':id',
      $limit: '1000',
      $offset: '0',
    });
  });

  it('returns the state licenses whose normalized business name is exactly the business name, beside the NPPES ones, with no not-checked note', async () => {
    const { candidates, notChecked } = await search('TX');

    expect(notChecked).toEqual([]);
    expect(candidates.filter((candidate) => candidate.registry !== 'NPPES')).toEqual([
      {
        subjectKey: 'firm',
        source: 'licenses',
        registry: 'Texas TDLR',
        licenseeName: 'HARBOR FIXTURE DENTAL LLC',
        licenseNumber: 'TACLA00031415E',
        licenseType: 'A/C Contractor',
        status: null,
        expiresOn: '2027-01-03',
        raw: expect.objectContaining({ license_number: 'TACLA00031415E' }),
      },
    ]);
    expect(candidates.map((candidate) => candidate.registry)).toContain('NPPES');
  });

  it.each([
    {
      state: 'IL',
      path: '/resource/pzzh-kp68.json',
      columns: ['business_name', 'businessdba'],
      license: {
        registry: 'Illinois IDFPR',
        licenseeName: 'HARBOR FIXTURE DENTAL, LTD.',
        licenseNumber: '191000777',
        licenseType: 'DENTAL PROFESSIONAL SERVICE CORPORATION',
        status: 'ACTIVE',
        expiresOn: '2027-06-30',
      },
    },
    {
      state: 'CO',
      path: '/resource/7s5z-vewr.json',
      columns: ['entityname'],
      license: {
        registry: 'Colorado DPO',
        licenseeName: 'Harbor Fixture Dental Inc',
        licenseNumber: 'DEN.0099123',
        licenseType: 'DEN',
        status: 'Active',
        expiresOn: '2027-02-28',
      },
    },
    {
      state: 'CT',
      path: '/resource/ngch-56tr.json',
      columns: ['businessname', 'dba'],
      license: {
        registry: 'Connecticut DCP',
        licenseeName: 'HARBOR FIXTURE DENTAL LLC',
        licenseNumber: 'DNC.0001234',
        licenseType: 'DENTAL CORPORATION',
        status: 'ACTIVE',
        expiresOn: '2027-03-31',
      },
    },
    {
      state: 'WA',
      path: '/resource/m8qx-ubtq.json',
      columns: ['businessname'],
      license: {
        registry: 'Washington L&I',
        licenseeName: 'HARBOR FIXTURE DENTAL LLC',
        licenseNumber: 'HARBOFD758NN',
        licenseType: 'CONSTRUCTION CONTRACTOR',
        status: 'ACTIVE',
        expiresOn: '2027-08-15',
      },
    },
  ])('searches the $state set by its business and DBA name columns and reads its license', async ({ state, path, columns, license }) => {
    const { candidates, notChecked } = await search(state);

    expect(notChecked).toEqual([]);
    expect(registries.received.find((request) => request.path === path)!.query.$where).toBe(
      columns.map((column) => `(${HARBOR_WORDS(column)})`).join(' OR '),
    );
    expect(candidates.filter((candidate) => candidate.registry !== 'NPPES')).toEqual([
      { subjectKey: 'firm', source: 'licenses', ...license, raw: expect.any(Object) },
    ]);
  });
  it('reads a license the state lists with no number or expiration date', async () => {
    registries.reply = (path, query) =>
      path === '/resource/7s5z-vewr.json'
        ? {
            status: 200,
            body: [{ entityname: 'HARBOR FIXTURE DENTAL LLC', licensetype: 'DEN', licensestatusdescription: 'Active', state: 'CO' }],
          }
        : defaultReply(path, query);

    const { candidates } = await search('CO');

    expect(candidates.filter((candidate) => candidate.registry === 'Colorado DPO')).toEqual([
      expect.objectContaining({ licenseeName: 'HARBOR FIXTURE DENTAL LLC', licenseNumber: null, expiresOn: null }),
    ]);
  });
});

describe('searchLicenses paging through a large state set', () => {
  it('asks for the next page while the last one came back full, and matches across every page', async () => {
    const filler = Array.from({ length: 1000 }, (_, index) => ({
      license_type: 'A/C Technician',
      license_number: `FILL${index}`,
      business_name: `HARBOR FIXTURE DENTAL ANNEX ${index}`,
      license_expiration_date_mmddccyy: '01/03/2027',
    }));
    registries.reply = (path, query) =>
      path === '/resource/7358-krk7.json'
        ? { status: 200, body: query.$offset === '0' ? filler : fixture('tx') }
        : defaultReply(path, query);

    const { candidates } = await search('TX');

    expect(
      registries.received.filter((request) => request.path === '/resource/7358-krk7.json').map((request) => request.query.$offset),
    ).toEqual(['0', '1000']);
    expect(candidates.filter((candidate) => candidate.registry === 'Texas TDLR').map((candidate) => candidate.licenseNumber)).toEqual([
      'TACLA00031415E',
    ]);
  });
});

describe('searchLicenses when a registry fails', () => {
  async function retryableFailureOf(searching: Promise<unknown>) {
    const failure: unknown = await searching.then(
      () => 'resolved',
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(ApplicationFailure);
    return failure as Error;
  }

  it.each([
    { registry: 'the state set', path: '/resource/7358-krk7.json' },
    { registry: 'NPPES', path: '/api/' },
  ])('fails the search so the run retries when $registry answers 503', async ({ path }) => {
    registries.reply = (requested, query) =>
      requested === path ? { status: 503, body: { message: 'unavailable' } } : defaultReply(requested, query);

    expect((await retryableFailureOf(search('TX'))).message).toMatch(/answered 503/);
  });

  it('fails the search so the run retries when a registry cannot be reached', async () => {
    await retryableFailureOf(searchLicenses({ business: HARBOR, state: 'TX' }, { ...urls, TX: 'http://127.0.0.1:1' }));
  });
});

describe('searchLicenses name matching', () => {
  it('matches a license by its DBA name', async () => {
    registries.reply = (path, query) =>
      path === '/resource/pzzh-kp68.json'
        ? {
            status: 200,
            body: [
              {
                license_type: 'DENTAL',
                description: 'DENTAL PROFESSIONAL SERVICE CORPORATION',
                license_number: '191000999',
                license_status: 'ACTIVE',
                business_name: 'LAKESHORE ORAL HEALTH LTD',
                businessdba: 'HARBOR FIXTURE DENTAL',
              },
            ],
          }
        : defaultReply(path, query);

    const { candidates } = await search('IL');

    expect(candidates.filter((candidate) => candidate.registry === 'Illinois IDFPR')).toEqual([
      expect.objectContaining({ licenseeName: 'LAKESHORE ORAL HEALTH LTD', licenseNumber: '191000999' }),
    ]);
  });

  it('matches an NPPES organization by one of its other names', async () => {
    registries.reply = (path, query) =>
      path === '/api/'
        ? {
            status: 200,
            body: {
              result_count: 1,
              results: [
                {
                  number: '1999000033',
                  basic: { organization_name: 'LAKESHORE ORAL HEALTH PLLC', status: 'A' },
                  other_names: [{ code: '3', type: 'Doing Business As', organization_name: 'HARBOR FIXTURE DENTAL' }],
                  taxonomies: [{ desc: 'Dentist', primary: true }],
                },
              ],
            },
          }
        : defaultReply(path, query);

    const { candidates } = await search('NV');

    expect(candidates.map((candidate) => candidate.licenseNumber)).toEqual(['1999000033']);
  });

  it("treats '&' as 'and' and ignores apostrophes, leaving 'and' out of the open-data filter", async () => {
    registries.reply = (path, query) =>
      path === '/resource/7358-krk7.json'
        ? {
            status: 200,
            body: [
              {
                license_type: 'A/C Contractor',
                license_number: 'TACLA00099999E',
                business_name: "O'HARBOR & FIXTURE DENTAL LLC",
                license_expiration_date_mmddccyy: '01/03/2027',
              },
            ],
          }
        : defaultReply(path, query);

    const { candidates } = await searchLicenses(
      { business: { key: 'firm', name: 'OHarbor and Fixture Dental' }, state: 'TX' },
      urls,
    );

    expect(registries.received.find((request) => request.path === '/resource/7358-krk7.json')!.query.$where).toBe(
      `(${['OHARBOR', 'FIXTURE', 'DENTAL']
        .map((word) => `upper(replace(business_name, "'", "")) like '%${word}%'`)
        .join(' AND ')})`,
    );
    expect(candidates.filter((candidate) => candidate.registry === 'Texas TDLR').map((candidate) => candidate.licenseNumber)).toEqual([
      'TACLA00099999E',
    ]);
  });
});

describe('searchLicenses for a business with no home state', () => {
  it('checks nothing and notes that licenses were not checked', async () => {
    const result = await searchLicenses({ business: HARBOR, state: null }, urls);

    expect(registries.received).toEqual([]);
    expect(result).toEqual({
      candidates: [],
      notChecked: ['License data is not available for a business with no state'],
    });
  });
});

describe('searchLicenses when a registry refuses the request', () => {
  it.each([
    { registry: 'the state set', path: '/resource/7358-krk7.json' },
    { registry: 'NPPES', path: '/api/' },
  ])('fails the search without retrying when $registry answers 400', async ({ path }) => {
    registries.reply = (requested, query) =>
      requested === path ? { status: 400, body: { message: 'bad query' } } : defaultReply(requested, query);

    const failure: unknown = await search('TX').catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApplicationFailure);
    expect(failure).toMatchObject({ nonRetryable: true, message: expect.stringMatching(/answered 400/) });
  });
});

function nppesOrganization(name: string, overrides: Record<string, unknown> = {}) {
  return {
    number: `NPI-${name}`,
    basic: { organization_name: name, status: 'A' },
    other_names: [],
    taxonomies: [{ desc: 'Dentist', primary: true }],
    ...overrides,
  };
}

function nppesReplies(pages: unknown[][]) {
  registries.reply = (path, query) =>
    path === '/api/'
      ? { status: 200, body: { result_count: 0, results: pages[Number(query.skip) / 200] ?? [] } }
      : defaultReply(path, query);
}

describe('searchLicenses against NPPES, page by page', () => {
  const crowd = (page: number) => Array.from({ length: 200 }, (_, index) => nppesOrganization(`HARBOR CROWD ${page}-${index}`));

  it('pages through NPPES while each page comes back full and matches across pages', async () => {
    nppesReplies([crowd(0), [nppesOrganization('HARBOR FIXTURE DENTAL PLLC')]]);

    const { candidates, notChecked } = await search('NV');

    expect(candidates.map((candidate) => candidate.licenseNumber)).toEqual(['NPI-HARBOR FIXTURE DENTAL PLLC']);
    expect(notChecked).toEqual(['License data is not available for NV']);
  });

  it('reports NPPES as not checked when its 1,200 results all come back full', async () => {
    nppesReplies([crowd(0), crowd(1), crowd(2), crowd(3), crowd(4), crowd(5), [nppesOrganization('HARBOR FIXTURE DENTAL PLLC')]]);

    const { candidates, notChecked } = await search('NV');

    expect(candidates).toEqual([]);
    expect(notChecked).toEqual([
      'NPPES was not checked: more than 1,200 organizations start with the same word',
      'License data is not available for NV',
    ]);
  });
});

describe('searchLicenses with a name that has too few searchable words', () => {
  it('asks NPPES by the first word with at least two letters', async () => {
    await searchLicenses({ business: { key: 'firm', name: 'A1 Harbor Fixture Dental' }, state: 'NV' }, urls);

    expect(registries.received[0]!.query.organization_name).toBe('HARBOR*');
  });

  it('reports NPPES as not checked, calling nobody, when no word has two letters', async () => {
    const result = await searchLicenses({ business: { key: 'firm', name: 'A B C' }, state: 'NV' }, urls);

    expect(registries.received).toEqual([]);
    expect(result.notChecked).toEqual([
      'NPPES was not checked: the name has no word to search by',
      'License data is not available for NV',
    ]);
  });

  it('reports the state as not checked, without asking it, when no word of the name can be searched there', async () => {
    const result = await searchLicenses({ business: { key: 'firm', name: 'Mgmt LLC' }, state: 'TX' }, urls);

    expect(registries.received.map((request) => request.path)).toEqual(['/api/']);
    expect(result.notChecked).toEqual(['License data for TX was not checked: the name has no word to search by']);
  });
});

describe('searchLicenses reading NPPES fields', () => {
  it('leaves the license type empty for an organization with no primary taxonomy', async () => {
    nppesReplies([[nppesOrganization('HARBOR FIXTURE DENTAL PLLC', { taxonomies: [{ desc: 'Dentist', primary: false }] })]]);

    const { candidates } = await search('NV');

    expect(candidates).toEqual([expect.objectContaining({ licenseType: null })]);
  });

  it("reads NPPES status 'A' as Active and 'D' as Inactive", async () => {
    nppesReplies([
      [
        nppesOrganization('HARBOR FIXTURE DENTAL PLLC'),
        nppesOrganization('HARBOR FIXTURE DENTAL, P.L.L.C.', { basic: { organization_name: 'HARBOR FIXTURE DENTAL, P.L.L.C.', status: 'D' } }),
      ],
    ]);

    const { candidates } = await search('NV');

    expect(candidates.map((candidate) => candidate.status)).toEqual(['Active', 'Inactive']);
  });
});

describe('searchLicenses reading a state expiration date', () => {
  it('leaves a date it cannot read empty and keeps it in raw', async () => {
    registries.reply = (path, query) =>
      path === '/resource/7358-krk7.json'
        ? {
            status: 200,
            body: [
              {
                license_type: 'A/C Contractor',
                license_number: 'TACLA00031415E',
                business_name: 'HARBOR FIXTURE DENTAL LLC',
                license_expiration_date_mmddccyy: '13/45/2027',
              },
            ],
          }
        : defaultReply(path, query);

    const { candidates } = await search('TX');

    expect(candidates.filter((candidate) => candidate.registry === 'Texas TDLR')).toEqual([
      expect.objectContaining({
        expiresOn: null,
        raw: expect.objectContaining({ license_expiration_date_mmddccyy: '13/45/2027' }),
      }),
    ]);
  });
});

describe('searchLicenses when a registry answers in a shape it does not expect', () => {
  it.each([
    { registry: 'the state set', path: '/resource/7358-krk7.json', body: [{ license_number: 'TACLA00031415E' }] },
    { registry: 'NPPES', path: '/api/', body: { unexpected: true } },
  ])('fails the search without retrying when $registry changes its answer', async ({ path, body }) => {
    registries.reply = (requested, query) => (requested === path ? { status: 200, body } : defaultReply(requested, query));

    const failure: unknown = await search('TX').catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApplicationFailure);
    expect(failure).toMatchObject({ nonRetryable: true });
  });
});

describe('searchLicenses for a Florida business whose name has no word to search by', () => {
  it('reports Florida as not checked without reading the Florida snapshot', async () => {
    const result = await searchLicenses({ business: { key: 'firm', name: 'LLC' }, state: 'FL' }, urls);

    expect(result).toEqual({
      candidates: [],
      notChecked: [
        'NPPES was not checked: the name has no word to search by',
        'License data for FL was not checked: the name has no word to search by',
      ],
    });
  });
});
