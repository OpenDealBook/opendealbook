import { describe, expect, it } from 'vitest';

import { csvRecords, firstZipEntry } from './csv';
import { RecordReader, RejectedRow } from './recordReader';
import {
  parseRegistry,
  parseRegistryDetail,
  registryAdapter,
  registryColumns,
  registryFiles,
} from './stateRegistries';

import { createReadStream, readFileSync } from 'node:fs';

function entityParser(dataset: string) {
  const adapter = registryAdapter(dataset);
  if ('attach' in adapter) throw new Error(`${dataset} attaches details`);
  return parseRegistry(adapter);
}

function detailParser(dataset: string) {
  const adapter = registryAdapter(dataset);
  if (!('attach' in adapter)) throw new Error(`${dataset} lists entities`);
  return parseRegistryDetail(adapter);
}

async function parseFixture<T>(
  parse: (reader: RecordReader) => T | null,
  name: string,
  zipped = false,
) {
  const entries: T[] = [];
  const rejected: string[] = [];
  const file = createReadStream(new URL(`./fixtures/${name}`, import.meta.url));
  for await (const record of csvRecords(
    zipped ? firstZipEntry(file) : file,
    [],
  )) {
    try {
      const entry = parse(new RecordReader(record));
      if (entry !== null) entries.push(entry);
    } catch (error) {
      if (!(error instanceof RejectedRow)) throw error;
      rejected.push(error.message);
    }
  }
  return { entries, rejected };
}

describe('New York registry file', () => {
  it('maps each corporation with its CEO as an officer and no address, since the file holds only process and agent addresses', async () => {
    const { entries, rejected } = await parseFixture(
      entityParser('NY'),
      'registry_ny.csv',
    );

    expect(entries).toEqual([
      {
        entity: {
          state: 'NY',
          entity_number: '9424185',
          source_id: null,
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
    const { entries } = await parseFixture(
      entityParser('CO'),
      'registry_co.csv',
    );

    expect(entries.map(({ entity }) => entity)).toEqual([
      {
        state: 'CO',
        entity_number: '19871000001',
        source_id: null,
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
    const { entries } = await parseFixture(
      entityParser('PA'),
      'registry_pa.csv',
    );

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
    const { entries } = await parseFixture(
      entityParser('CT'),
      'registry_ct.csv',
    );

    expect(entries).toEqual([
      {
        entity: {
          state: 'CT',
          entity_number: '1000001',
          source_id: '001t000000sample1',
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

const INACTIVE_STATUS =
  /\b(dissolved|inactive|revoked|forfeited|withdrawn|cancell?ed|terminated|merged|expired)\b/i;

function texasStatus(sos: string, rightToTransact: string) {
  return entityParser('TX')(
    new RecordReader({
      'Secretary of State (SOS) or COA File Number': '0800000009',
      'Taxpayer Name': 'SAMPLE CO',
      'SOS Status Code': sos,
      'Right to Transact Business Code': rightToTransact,
    }),
  )!.entity.status;
}

describe('Texas franchise tax file', () => {
  it('matches headers padded with spaces and trims padded values', async () => {
    const { entries } = await parseFixture(
      entityParser('TX'),
      'registry_tx.csv',
    );

    expect(entries.map(({ entity }) => entity)[0]).toEqual({
      state: 'TX',
      entity_number: '0800000001',
      source_id: null,
      name: 'MESQUITE FLATS ROOFING LLC',
      status: 'active',
      formation_date: '2026-08-21',
      registered_agent: null,
      mailing_address_line1: '77 SAMPLE DR',
      mailing_city: 'AUSTIN',
      mailing_state: 'TX',
      mailing_postal_code: '78701',
    });
  });

  it('names why a business is inactive from its trimmed SOS status or its right to transact', async () => {
    const { entries } = await parseFixture(
      entityParser('TX'),
      'registry_tx.csv',
    );

    expect(entries.map(({ entity }) => entity.status)).toEqual([
      'active',
      'inactive (right to transact forfeited)',
      'inactive (forfeited franchise tax)',
      'inactive (consolidated)',
      'inactive (franchise tax involuntarily ended)',
    ]);
  });

  it.each([...'DEFKLNPTWMBCIJYZ'])(
    'stores SOS status %s as a status the inactive filter matches',
    (code) => {
      expect(texasStatus(code, 'A')).toMatch(INACTIVE_STATUS);
    },
  );

  it.each(['N', 'I'])(
    'stores right to transact %s as a status the inactive filter matches',
    (code) => {
      expect(texasStatus('A', code)).toMatch(INACTIVE_STATUS);
    },
  );

  it.each(['A', 'R', 'G', 'V', 'X', ''])(
    'keeps SOS status "%s" with its right to transact active',
    (code) => {
      expect(texasStatus(code, 'A')).not.toMatch(INACTIVE_STATUS);
    },
  );
});

describe('District of Columbia registry file', () => {
  it('reads a file that starts with a byte order mark and a timestamped date', async () => {
    const { entries } = await parseFixture(
      entityParser('DC'),
      'registry_dc.csv',
    );

    expect(entries.map(({ entity }) => entity)).toEqual([
      {
        state: 'DC',
        entity_number: '733100',
        source_id: null,
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
    const { entries } = await parseFixture(
      entityParser('IA'),
      'registry_ia.zip',
      true,
    );

    expect(entries).toEqual([
      {
        entity: {
          state: 'IA',
          entity_number: '600001',
          source_id: null,
          name: 'Prairie Lantern Seed Co',
          status: 'active',
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
    const iowa = registryAdapter('IA');
    const metadata = JSON.parse(
      readFileSync(
        new URL('./fixtures/registry_ia_metadata.json', import.meta.url),
        'utf8',
      ),
    );

    expect(iowa.published?.date(metadata)).toBe('2026-10-23');
  });

  it('refuses dataset metadata that has no last-updated date', () => {
    const iowa = registryAdapter('IA');

    expect(() =>
      iowa.published?.date({ data: { name: 'Active Iowa Business Entities' } }),
    ).toThrow(/lastUpdated/);
  });
});

describe('Oregon active businesses file', () => {
  it('takes the address from the principal place of business row and the agent from the registered agent row, skipping assumed business names', async () => {
    const { entries } = await parseFixture(
      entityParser('OR'),
      'registry_or.csv',
    );

    expect(entries[0]).toEqual({
      entity: {
        state: 'OR',
        entity_number: '100001',
        source_id: '100001',
        name: 'CEDAR BLUFF CIDERWORKS LLC',
        status: 'active',
        formation_date: '2019-05-17',
        registered_agent: null,
        mailing_address_line1: null,
        mailing_city: null,
        mailing_state: null,
        mailing_postal_code: null,
      },
      officers: [],
    });
    expect(
      entries.map(({ entity }) => [
        entity.entity_number,
        entity.registered_agent,
        entity.mailing_address_line1,
        entity.mailing_postal_code,
      ]),
    ).toEqual([
      ['100001', null, null, null],
      ['100001', null, '12 SAMPLE LN', '97702'],
      ['100001', 'CASEY Q FICTIONAL', null, null],
      ['200002', 'SAMPLE REGISTERED AGENTS INC', null, null],
      ['200002', null, '40 SAMPLE ST', '97401'],
    ]);
  });
});

describe('Oregon registered agent', () => {
  it('takes the entity of record name over the person name, without joining them', () => {
    expect(
      entityParser('OR')(
        new RecordReader({
          'Registry Number': '100001',
          'Business Name': 'CEDAR BLUFF CIDERWORKS LLC',
          'Associated Name Type': 'REGISTERED AGENT',
          'First Name': 'CASEY',
          'Last Name': 'FICTIONAL',
          'Entity of Record Name': 'SAMPLE REGISTERED AGENTS INC',
        }),
      )!.entity.registered_agent,
    ).toBe('SAMPLE REGISTERED AGENTS INC');
  });
});

describe('Oregon authorized representatives', () => {
  it('reads an authorized representative row of the active businesses file as an officer, person or company', () => {
    const parse = entityParser('OR');
    const row = (names: Record<string, string>) =>
      parse(
        new RecordReader({
          'Registry Number': '100001',
          'Business Name': 'CEDAR BLUFF CIDERWORKS LLC',
          'Associated Name Type': 'AUTHORIZED REPRESENTATIVE',
          ...names,
        }),
      )!.officers;

    expect(row({ 'First Name': 'PAT', 'Last Name': 'SAMPLE' })).toEqual([
      { name: 'PAT SAMPLE', title: 'AUTHORIZED REPRESENTATIVE' },
    ]);
    expect(
      row({ 'Entity of Record Name': 'SAMPLE ORCHARD HOLDINGS LLC' }),
    ).toEqual([
      {
        name: 'SAMPLE ORCHARD HOLDINGS LLC',
        title: 'AUTHORIZED REPRESENTATIVE',
      },
    ]);
  });
});

describe('Oregon new businesses file', () => {
  it('reads every people role, people or companies, lists the business on every other row, and skips assumed business names', async () => {
    const { entries } = await parseFixture(
      detailParser('OR officers'),
      'registry_or_officers.csv',
    );

    expect(
      entries.map(({ source_id, officers }) => [source_id, officers]),
    ).toEqual([
      [
        '100001',
        [
          {
            name: 'CASEY Q FICTIONAL',
            title: 'INDIVIDUAL WITH DIRECT KNOWLEDGE',
          },
        ],
      ],
      ['100001', [{ name: 'CASEY Q FICTIONAL', title: 'MEMBER' }]],
      ['100001', [{ name: 'RILEY EXAMPLE JR', title: 'MANAGER' }]],
      ['100001', [{ name: 'SAMPLE ORCHARD HOLDINGS LLC', title: 'MEMBER' }]],
      ['100001', [{ name: 'PAT SAMPLE', title: 'REGISTRANT' }]],
      ['100001', []],
      ['100001', []],
      ['100001', []],
      ['500005', [{ name: 'JESSE EXAMPLE', title: 'MANAGER' }]],
      ['500005', [{ name: 'JORDAN EXAMPLE', title: 'MEMBER' }]],
    ]);
  });
});

describe('Connecticut principals file', () => {
  it('keys each principal by the business Id, calls an undesignated one Principal and splits a joined designation', async () => {
    const { entries } = await parseFixture(
      detailParser('CT principals'),
      'registry_ct_principals.csv',
    );

    expect(entries).toEqual([
      {
        source_id: '001t000000sample1',
        registered_agent: null,
        officers: [{ name: 'Morgan Example', title: 'Principal' }],
        rows: 1,
      },
      {
        source_id: '001t000000sample1',
        registered_agent: null,
        officers: [
          { name: 'Quinn Fictional', title: 'Officer' },
          { name: 'Quinn Fictional', title: 'Director' },
        ],
        rows: 1,
      },
      {
        source_id: '001t000000nobody9',
        registered_agent: null,
        officers: [{ name: 'Sky Sample', title: 'Director' }],
        rows: 1,
      },
    ]);
  });
});

describe('Connecticut principal designations', () => {
  it('trims each part of a designation split on a semicolon', () => {
    expect(
      detailParser('CT principals')(
        new RecordReader({
          Unique_Key: '001t000000sample1',
          'Principal Name': 'Quinn Fictional',
          Designation: 'Officer; Director',
        }),
      )!.officers,
    ).toEqual([
      { name: 'Quinn Fictional', title: 'Officer' },
      { name: 'Quinn Fictional', title: 'Director' },
    ]);
  });
});

describe('Connecticut agents file', () => {
  it('keys each registered agent by the business Id', async () => {
    const { entries } = await parseFixture(
      detailParser('CT agents'),
      'registry_ct_agents.csv',
    );

    expect(entries).toEqual([
      {
        source_id: '001t000000sample1',
        registered_agent: 'Sample Agent Services LLC',
        officers: [],
        rows: 1,
      },
    ]);
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
    ['OR', 'registry_or.csv', false],
    ['OR officers', 'registry_or_officers.csv', false],
    ['CT principals', 'registry_ct_principals.csv', false],
    ['CT agents', 'registry_ct_agents.csv', false],
  ] as const)(
    'finds every column the %s adapter reads in its file',
    async (dataset, name, zipped) => {
      const file = createReadStream(
        new URL(`./fixtures/${name}`, import.meta.url),
      );
      const records = csvRecords(
        zipped ? firstZipEntry(file) : file,
        registryColumns(registryAdapter(dataset)),
      );

      await expect(records.next()).resolves.toMatchObject({ done: false });
      await records.return(undefined);
    },
  );
});

describe('registry files', () => {
  it('names the main file of its state as the parent of each detail file', () => {
    expect(
      registryFiles().flatMap((file) =>
        file.parent ? [[file.dataset, file.parent]] : [],
      ),
    ).toEqual([
      ['CT principals', 'CT'],
      ['CT agents', 'CT'],
      ['OR officers', 'OR'],
    ]);
  });
});
