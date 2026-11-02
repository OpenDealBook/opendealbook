import { describe, expect, it } from 'vitest';

import { csvRecords, firstZipEntry } from './csv';
import { RecordReader, RejectedRow } from './recordReader';
import {
  mergeRegistryDetail,
  mergeRegistryEntry,
  parseRegistry,
  parseRegistryDetail,
  registryAdapter,
  registryColumns,
  registryFiles,
} from './stateRegistries';

import { createReadStream, readFileSync } from 'node:fs';

const UNSET_DETAILS = {
  registered_agent_vacant: false,
  status: null,
  principal_address_line1: null,
  principal_city: null,
  principal_state: null,
  principal_postal_code: null,
};

function entityParser(dataset: string) {
  const adapter = registryAdapter(dataset);
  if ('attach' in adapter) throw new Error(`${dataset} attaches details`);
  return parseRegistry(adapter);
}

function detailParser(dataset: string) {
  return parseRegistryDetail(detailAdapter(dataset));
}

function detailAdapter(dataset: string) {
  const adapter = registryAdapter(dataset);
  if (!('attach' in adapter)) throw new Error(`${dataset} lists entities`);
  return adapter;
}

function mergedNyEntity(rows: Record<string, string>[]) {
  const adapter = registryAdapter('NY');
  if ('attach' in adapter) throw new Error('NY attaches details');
  return rows
    .map((row) => parseRegistry(adapter)(new RecordReader(row))!)
    .reduce(mergeRegistryEntry);
}

function mergedNyDetail(dataset: string, rows: Record<string, string>[]) {
  const adapter = detailAdapter(dataset);
  return rows
    .map((row) => parseRegistryDetail(adapter)(new RecordReader(row))!)
    .reduce(mergeRegistryDetail(adapter));
}

const nyAddress = (
  date_filed: string,
  addr_type: string,
  name: string,
  addr1 = '',
) => ({
  corpid_num: '9424185',
  date_filed,
  film_num: date_filed.replaceAll('-', ''),
  addr_type,
  name,
  addr1,
  city: '',
  state: '',
  zip5: '',
});

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

describe('New York filings file', () => {
  it('maps each filing to its entity, keyed by the DOS ID, with the filing date, type and name the filing carries, and its fictitious name as an alias only when it has one', async () => {
    const { entries, rejected } = await parseFixture(
      entityParser('NY'),
      'registry_ny.csv',
    );

    expect(entries).toEqual([
      {
        entity: {
          state: 'NY',
          entity_number: '9072354',
          source_id: '9072354',
          name: 'GRAY HERON SEAFOOD CORP.',
          status: null,
          formation_date: '2011-03-24',
          registered_agent: null,
          entity_type: 'DOMESTIC BUSINESS CORPORATION',
          principal_address_line1: null,
          principal_city: null,
          principal_state: null,
          principal_postal_code: null,
          mailing_address_line1: null,
          mailing_city: null,
          mailing_state: null,
          mailing_postal_code: null,
        },
        officers: [],
        filing: '2011-03-24T00:00:00.000 110324000101',
      },
      {
        entity: expect.objectContaining({
          entity_number: '9424185',
          name: 'MAPLE HOLLOW WINE & SPIRITS, INC.',
          formation_date: '2013-06-27',
          aliases: ['MAPLE HOLLOW OF NEW YORK, INC.'],
        }),
        officers: [],
        filing: '2013-06-27T00:00:00.000 130627000201',
      },
      {
        entity: expect.not.objectContaining({ aliases: expect.anything() }),
        officers: [],
        filing: '2019-02-11T00:00:00.000 190211000301',
      },
    ]);
    expect(rejected).toEqual([]);
  });

  it('takes the name and type of the latest filing and the earliest real filing date as the formation date, whatever order the filings arrive in, ignoring the 1900-01-01 placeholder', () => {
    const filing = (
      date_filed: string,
      film_num: string,
      corp_name: string,
      entitytype: string,
    ) => ({
      corpid_num: '9424185',
      date_filed,
      film_num,
      entitytype,
      corp_name,
      fict_name: '',
    });

    const { entity } = mergedNyEntity([
      filing('2013-06-27T00:00:00.000', '9', 'MAPLE HOLLOW, INC.', 'OLD TYPE'),
      filing('2019-02-11T00:00:00.000', '10', 'MAPLE HOLLOW SPIRITS', 'NEW'),
      filing('1900-01-01T00:00:00.000', '1', 'PLACEHOLDER NAME', 'OLDEST'),
      filing('2019-02-11T00:00:00.000', '2', 'MAPLE HOLLOW TWO', 'MIDDLE'),
    ]);

    expect(entity).toMatchObject({
      name: 'MAPLE HOLLOW SPIRITS',
      entity_type: 'NEW',
      formation_date: '2013-06-27',
    });
  });

  it.each(['NY', 'NY status', 'NY addresses'])(
    'reads the %s file grouped by DOS ID, so each entity merges within one batch',
    (dataset) => {
      const url = new URL(registryAdapter(dataset).url);

      expect(url.searchParams.get('$order')).toMatch(/^corpid_num,/);
    },
  );
});

describe('New York status history file', () => {
  it('keys each status row by the DOS ID and keeps the status as published', async () => {
    const { entries } = await parseFixture(
      detailParser('NY status'),
      'registry_ny_status.csv',
    );

    expect(entries.map(({ source_id, status }) => [source_id, status])).toEqual(
      [
        ['9072354', 'Active'],
        ['9072354', 'Active'],
        ['9072354', 'Inactive'],
        ['9424185', 'Active'],
        ['9424185', 'Suspended'],
        ['9999001', 'Active'],
      ],
    );
    expect(entries[0]).toEqual({
      source_id: '9072354',
      registered_agent: null,
      registered_agent_vacant: false,
      officers: [],
      status: 'Active',
      principal_address_line1: null,
      principal_city: null,
      principal_state: null,
      principal_postal_code: null,
      rows: 1,
      filed: {
        agent: '2011-03-24T00:00:00.000 110324000101',
        officers: '2011-03-24T00:00:00.000 110324000101',
        status: '2011-03-24T00:00:00.000 110324000101',
        principal: '2011-03-24T00:00:00.000 110324000101',
      },
    });
  });

  it.each([
    [['Active', 'Suspended', 'Discontinued', 'InActive'], 'InActive'],
    [['InActive', 'Discontinued', 'Suspended', 'Active'], 'InActive'],
    [['Active', 'Suspended', 'DISCONTINUED'], 'DISCONTINUED'],
    [['Discontinued', 'Suspended', 'Active'], 'Discontinued'],
    [['Suspended', 'Active'], 'Suspended'],
    [['Active', 'suspended'], 'suspended'],
  ])(
    'keeps the most restrictive of the statuses %j on the latest filing, ahead of an earlier filing that arrives after it',
    (latest, expected) => {
      const status = (date_filed: string, value: string) => ({
        corpid_num: '9072354',
        date_filed,
        film_num: '1',
        status: value,
      });

      const merged = mergedNyDetail('NY status', [
        ...latest.map((value) => status('2016-07-01T00:00:00.000', value)),
        status('2011-03-24T00:00:00.000', 'Inactive'),
      ]);

      expect(merged.status).toBe(expected);
    },
  );
});

describe('New York address file', () => {
  it('takes the registered agent from type 2, the CEO from type 3 and the principal executive office from type 4, leaving the process address unused', async () => {
    const { entries } = await parseFixture(
      detailParser('NY addresses'),
      'registry_ny_addresses.csv',
    );

    const none = {
      registered_agent: null,
      registered_agent_vacant: false,
      officers: [],
      status: null,
      principal_address_line1: null,
      principal_city: null,
      principal_state: null,
      principal_postal_code: null,
      rows: 1,
      filed: expect.anything(),
    };
    expect(entries.slice(0, 4)).toEqual([
      { ...none, source_id: '9072354' },
      { ...none, source_id: '9424185', registered_agent: 'SAMPLE AGENTS LLC' },
      {
        ...none,
        source_id: '9424185',
        officers: [{ name: 'DANA FICTIONAL', title: 'CEO' }],
      },
      {
        ...none,
        source_id: '9424185',
        principal_address_line1: '23 SAMPLE PLACE',
        principal_city: 'MOUNT VERNON',
        principal_state: 'NY',
        principal_postal_code: '10550',
      },
    ]);
  });
});

describe('New York latest filing', () => {
  it('keeps every CEO and every registered agent named on the latest filing and none from an earlier filing that arrives after it', () => {
    const merged = mergedNyDetail('NY addresses', [
      nyAddress('2019-02-11', '3', 'ROBIN EXAMPLE'),
      nyAddress('2019-02-11', '2', 'SAMPLE AGENTS LLC'),
      nyAddress('2019-02-11', '3', 'CASEY EXAMPLE'),
      nyAddress('2019-02-11', '2', 'SECOND AGENTS INC'),
      nyAddress('2013-06-27', '3', 'DANA FICTIONAL'),
      nyAddress('2013-06-27', '2', 'OLD AGENTS LLC'),
    ]);

    expect(merged).toMatchObject({
      registered_agent: 'SAMPLE AGENTS LLC; SECOND AGENTS INC',
      registered_agent_vacant: false,
      officers: [
        { name: 'ROBIN EXAMPLE', title: 'CEO' },
        { name: 'CASEY EXAMPLE', title: 'CEO' },
      ],
    });
  });

  it('keeps the principal executive office and a revoked agent of the latest filing over an earlier filing that arrives after it', () => {
    const merged = mergedNyDetail('NY addresses', [
      nyAddress('2021-04-01', '2', 'Registered Agent Revoked'),
      nyAddress('2021-04-01', '4', 'MAPLE HOLLOW', '5 SAMPLE PLAZA'),
      nyAddress('2013-06-27', '2', 'SAMPLE AGENTS LLC'),
      nyAddress('2013-06-27', '4', 'MAPLE HOLLOW', '23 SAMPLE PLACE'),
    ]);

    expect(merged).toMatchObject({
      registered_agent: null,
      registered_agent_vacant: true,
      principal_address_line1: '5 SAMPLE PLAZA',
    });
  });
});

describe('New York vacant registered agent', () => {
  it.each([
    'REGISTERED AGENT REVOKED',
    'Registered Agent Revoked',
    'REGISTERED AGENT RESIGNED',
    'registered agent resigned',
  ])('reads the placeholder %s as no current agent', (placeholder) => {
    expect(
      detailParser('NY addresses')(
        new RecordReader({
          corpid_num: '9424185',
          addr_type: '2',
          name: placeholder,
          addr1: '',
          city: '',
          state: '',
          zip5: '',
        }),
      ),
    ).toMatchObject({ registered_agent: null, registered_agent_vacant: true });
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
        ...UNSET_DETAILS,
        rows: 1,
      },
      {
        source_id: '001t000000sample1',
        registered_agent: null,
        officers: [
          { name: 'Quinn Fictional', title: 'Officer' },
          { name: 'Quinn Fictional', title: 'Director' },
        ],
        ...UNSET_DETAILS,
        rows: 1,
      },
      {
        source_id: '001t000000nobody9',
        registered_agent: null,
        officers: [{ name: 'Sky Sample', title: 'Director' }],
        ...UNSET_DETAILS,
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
        ...UNSET_DETAILS,
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
    ['NY status', 'registry_ny_status.csv', false],
    ['NY addresses', 'registry_ny_addresses.csv', false],
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
      ['NY status', 'NY'],
      ['NY addresses', 'NY'],
      ['CT principals', 'CT'],
      ['CT agents', 'CT'],
    ]);
  });
});
