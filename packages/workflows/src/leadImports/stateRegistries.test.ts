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
  it('maps each corporation with its type, its CEO as an officer and its physical location as the principal address, leaving the process address out of mailing', async () => {
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
          entity_type: 'DOMESTIC BUSINESS CORPORATION',
          principal_address_line1: '5 SAMPLE PLAZA',
          principal_city: 'MOUNT VERNON',
          principal_state: 'NY',
          principal_postal_code: '10552',
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
  it('keeps the raw status and type, joins the agent name parts and keeps the principal and mailing addresses apart', async () => {
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
        entity_type: 'DLLC',
        principal_address_line1: '12 Sample Ave',
        principal_city: 'Denver',
        principal_state: 'CO',
        principal_postal_code: '80202',
        mailing_address_line1: 'PO Box 7',
        mailing_city: 'Denver',
        mailing_state: 'CO',
        mailing_postal_code: '80201',
      },
      expect.objectContaining({
        entity_number: '20001000002',
        registered_agent: 'Sample Registered Agents Inc',
      }),
    ]);
  });
});

describe('Pennsylvania registry file', () => {
  it('reads each officer row with its title, keeps the leading zeros of the filing number and the type, and takes its street address as the principal address', async () => {
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
          entity_type: 'Domestic Business Corporation',
          principal_address_line1: '4 Sample Rd',
          principal_city: 'Erie',
          principal_state: 'PA',
          principal_postal_code: '16501',
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
  it('maps the business master record, its business address as principal and its joined mailing address split into parts', async () => {
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
          entity_type: 'LLC',
          principal_address_line1: '9 Sample St',
          principal_city: 'Mystic',
          principal_state: 'CT',
          principal_postal_code: '06355',
          mailing_address_line1: 'PO Box 12, Unit 3',
          mailing_city: 'Mystic',
          mailing_state: 'CT',
          mailing_postal_code: '06355',
        },
        officers: [],
      },
    ]);
  });
});

describe('Connecticut joined mailing address', () => {
  it('keeps the unit on the first address line after the street', () => {
    const entity = entityParser('CT')(
      new RecordReader({
        Name: 'Harbor Light Bakery LLC',
        AccountNumber: '1000001',
        Mailing_Address:
          '100 Sample Rd, Suite 4 , 2nd Floor ,Hartford ,CT ,United States ,06103',
      }),
    )!.entity;

    expect([
      entity.mailing_address_line1,
      entity.mailing_city,
      entity.mailing_state,
      entity.mailing_postal_code,
    ]).toEqual([
      '100 Sample Rd, Suite 4, 2nd Floor',
      'Hartford',
      'CT',
      '06103',
    ]);
  });

  it('stores no mailing address when every part of the joined address is blank', () => {
    const entity = entityParser('CT')(
      new RecordReader({
        Name: 'Harbor Light Bakery LLC',
        AccountNumber: '1000001',
        Mailing_Address: ', , , , ,',
      }),
    )!.entity;

    expect([
      entity.mailing_address_line1,
      entity.mailing_city,
      entity.mailing_state,
      entity.mailing_postal_code,
    ]).toEqual([null, null, null, null]);
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
      entity_type: 'TEXAS LIMITED LIABILITY COMPANY',
      principal_address_line1: null,
      principal_city: null,
      principal_state: null,
      principal_postal_code: null,
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

describe('Texas organizational type', () => {
  it('keeps a code the record layout does not list as it is', () => {
    expect(
      entityParser('TX')(
        new RecordReader({
          'Secretary of State (SOS) or COA File Number': '0800000009',
          'Taxpayer Name': 'SAMPLE CO',
          'Taxpayer Organizational Type': 'QQ',
        }),
      )!.entity.entity_type,
    ).toBe('QQ');
  });
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
        entity_type: 'Domestic Limited Liability Company',
        principal_address_line1: '1 Sample St NW',
        principal_city: 'Washington',
        principal_state: 'DC',
        principal_postal_code: '20001',
        mailing_address_line1: null,
        mailing_city: null,
        mailing_state: null,
        mailing_postal_code: null,
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
          entity_type: 'Domestic Profit',
          principal_address_line1: '88 Sample Rd',
          principal_city: 'Ames',
          principal_state: 'IA',
          principal_postal_code: '50014',
          mailing_address_line1: null,
          mailing_city: null,
          mailing_state: null,
          mailing_postal_code: null,
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
  it('takes each address from its own row type and the agent from the registered agent row, skipping assumed business names', async () => {
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
        entity_type: 'DOMESTIC LIMITED LIABILITY COMPANY',
        principal_address_line1: null,
        principal_city: null,
        principal_state: null,
        principal_postal_code: null,
        mailing_address_line1: 'PO BOX 1',
        mailing_city: 'BEND',
        mailing_state: 'OR',
        mailing_postal_code: '97701',
      },
      officers: [],
    });
    expect(
      entries.map(({ entity }) => [
        entity.entity_number,
        entity.registered_agent,
        entity.principal_address_line1,
        entity.mailing_address_line1,
      ]),
    ).toEqual([
      ['100001', null, null, 'PO BOX 1'],
      ['100001', null, '12 SAMPLE LN', null],
      ['100001', 'CASEY Q FICTIONAL', null, null],
      ['200002', 'SAMPLE REGISTERED AGENTS INC', null, null],
      ['200002', null, '40 SAMPLE ST', null],
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
  it('reads an authorized representative row of the active businesses file as an Authorized Representative, person or company', () => {
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
      { name: 'PAT SAMPLE', title: 'Authorized Representative' },
    ]);
    expect(
      row({ 'Entity of Record Name': 'SAMPLE ORCHARD HOLDINGS LLC' }),
    ).toEqual([
      {
        name: 'SAMPLE ORCHARD HOLDINGS LLC',
        title: 'Authorized Representative',
      },
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
    ]);
  });
});
