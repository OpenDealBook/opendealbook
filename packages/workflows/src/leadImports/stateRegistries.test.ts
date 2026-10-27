import { describe, expect, it } from 'vitest';

import { csvRecords, firstZipEntry } from './csv';
import { RecordReader, RejectedRow } from './recordReader';
import {
  parseRegistry,
  REGISTRY_ADAPTERS,
  registryAdapter,
  registryColumns,
} from './stateRegistries';

import { createReadStream, readFileSync } from 'node:fs';

async function parseFixture(state: string, name: string, zipped = false) {
  const adapter = REGISTRY_ADAPTERS.find(
    (candidate) => candidate.state === state,
  )!;
  const parse = parseRegistry(adapter);
  const entries = [];
  const rejected: string[] = [];
  const file = createReadStream(new URL(`./fixtures/${name}`, import.meta.url));
  for await (const record of csvRecords(
    zipped ? firstZipEntry(file) : file,
    [],
  )) {
    try {
      entries.push(parse(new RecordReader(record)));
    } catch (error) {
      if (!(error instanceof RejectedRow)) throw error;
      rejected.push(error.message);
    }
  }
  return { entries, rejected };
}

describe('New York registry file', () => {
  it('maps each corporation with its CEO as an officer and no address, since the file holds only process and agent addresses', async () => {
    const { entries, rejected } = await parseFixture('NY', 'registry_ny.csv');

    expect(entries).toEqual([
      {
        entity: {
          state: 'NY',
          entity_number: '9424185',
          name: 'MAPLE HOLLOW WINE & SPIRITS, INC.',
          status: null,
          formation_date: '2013-06-27',
          registered_agent: 'SAMPLE AGENTS LLC',
          mailing_address_line1: null,
          mailing_city: null,
          mailing_state: null,
          mailing_postal_code: null,
        },
        officers: [{ name: 'DANA FICTIONAL', title: 'CEO' }],
      },
      {
        entity: expect.objectContaining({
          entity_number: '9072354',
          registered_agent: null,
        }),
        officers: [],
      },
    ]);
    expect(rejected).toEqual(['DOS ID: ']);
  });
});

describe('Colorado registry file', () => {
  it('keeps the raw status and joins the agent name parts', async () => {
    const { entries } = await parseFixture('CO', 'registry_co.csv');

    expect(entries.map(({ entity }) => entity)).toEqual([
      {
        state: 'CO',
        entity_number: '19871000001',
        name: 'Aspen Ridge Plumbing LLC',
        status: 'Delinquent',
        formation_date: '1987-11-13',
        registered_agent: 'Robin Q Fictional',
        mailing_address_line1: '12 Sample Ave',
        mailing_city: 'Denver',
        mailing_state: 'CO',
        mailing_postal_code: '80202',
      },
      expect.objectContaining({
        entity_number: '20001000002',
        registered_agent: 'Sample Registered Agents Inc',
      }),
    ]);
  });
});

describe('Pennsylvania registry file', () => {
  it('reads each officer row with its title, keeps the leading zeros of the filing number, and takes no registered-office address', async () => {
    const { entries } = await parseFixture('PA', 'registry_pa.csv');

    expect(entries).toEqual([
      {
        entity: expect.objectContaining({
          entity_number: '0006306940',
          status: null,
          formation_date: '2015-10-07',
          mailing_address_line1: null,
          mailing_city: null,
          mailing_state: null,
          mailing_postal_code: null,
        }),
        officers: [{ name: 'Avery Fictional', title: 'President' }],
      },
      {
        entity: expect.objectContaining({ entity_number: '0006306940' }),
        officers: [{ name: 'Jordan J Example', title: 'Secretary' }],
      },
    ]);
  });
});

describe('Connecticut registry file', () => {
  it('maps the business master record', async () => {
    const { entries } = await parseFixture('CT', 'registry_ct.csv');

    expect(entries).toEqual([
      {
        entity: {
          state: 'CT',
          entity_number: '1000001',
          name: 'Harbor Light Bakery LLC',
          status: 'Active',
          formation_date: '2012-03-14',
          registered_agent: null,
          mailing_address_line1: '9 Sample St',
          mailing_city: 'Mystic',
          mailing_state: 'CT',
          mailing_postal_code: '06355',
        },
        officers: [],
      },
    ]);
  });
});

describe('Texas franchise tax file', () => {
  it('matches headers padded with spaces and trims padded values', async () => {
    const { entries } = await parseFixture('TX', 'registry_tx.csv');

    expect(entries.map(({ entity }) => entity)).toEqual([
      {
        state: 'TX',
        entity_number: '0800000001',
        name: 'MESQUITE FLATS ROOFING LLC',
        status: 'A',
        formation_date: '2026-08-21',
        registered_agent: null,
        mailing_address_line1: '77 SAMPLE DR',
        mailing_city: 'AUSTIN',
        mailing_state: 'TX',
        mailing_postal_code: '78701',
      },
    ]);
  });
});

describe('District of Columbia registry file', () => {
  it('reads a file that starts with a byte order mark and a timestamped date', async () => {
    const { entries } = await parseFixture('DC', 'registry_dc.csv');

    expect(entries.map(({ entity }) => entity)).toEqual([
      {
        state: 'DC',
        entity_number: '733100',
        name: 'Capitol Row Tailors LLC',
        status: 'Active - In Good Standing',
        formation_date: '2023-12-22',
        registered_agent: 'Sample Agent Services',
        mailing_address_line1: '1 Sample St NW',
        mailing_city: 'Washington',
        mailing_state: 'DC',
        mailing_postal_code: '20001',
      },
    ]);
  });
});

describe('Iowa registry file', () => {
  it('reads the home office record out of a zip whose entry is stored with a data descriptor', async () => {
    const { entries } = await parseFixture('IA', 'registry_ia.zip', true);

    expect(entries).toEqual([
      {
        entity: {
          state: 'IA',
          entity_number: '600001',
          name: 'Prairie Lantern Seed Co',
          status: null,
          formation_date: '2004-05-17',
          registered_agent: 'Morgan Fictional',
          mailing_address_line1: '88 Sample Rd',
          mailing_city: 'Ames',
          mailing_state: 'IA',
          mailing_postal_code: '50014',
        },
        officers: [],
      },
    ]);
  });

  it('takes its as-of date from the date the dataset page publishes', () => {
    const iowa = REGISTRY_ADAPTERS.find((adapter) => adapter.state === 'IA')!;
    const metadata = JSON.parse(
      readFileSync(
        new URL('./fixtures/registry_ia_metadata.json', import.meta.url),
        'utf8',
      ),
    );

    expect(iowa.published?.date(metadata)).toBe('2026-10-23');
  });

  it('refuses dataset metadata that has no last-updated date', () => {
    const iowa = REGISTRY_ADAPTERS.find((adapter) => adapter.state === 'IA')!;

    expect(() =>
      iowa.published?.date({ data: { name: 'Active Iowa Business Entities' } }),
    ).toThrow(/lastUpdated/);
  });
});

describe('registry columns', () => {
  it.each([
    ['NY', 'registry_ny.csv', false],
    ['CO', 'registry_co.csv', false],
    ['PA', 'registry_pa.csv', false],
    ['CT', 'registry_ct.csv', false],
    ['TX', 'registry_tx.csv', false],
    ['DC', 'registry_dc.csv', false],
    ['IA', 'registry_ia.zip', true],
  ] as const)(
    'finds every column the %s adapter reads in its file',
    async (state, name, zipped) => {
      const file = createReadStream(
        new URL(`./fixtures/${name}`, import.meta.url),
      );
      const records = csvRecords(
        zipped ? firstZipEntry(file) : file,
        registryColumns(registryAdapter(state)),
      );

      await expect(records.next()).resolves.toMatchObject({ done: false });
      await records.return(undefined);
    },
  );
});
