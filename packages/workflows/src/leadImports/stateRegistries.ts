import { z } from 'zod';

import type { TablesInsert } from '@odb/supabase';

import type { LeadFileRef } from './files';
import type { RecordReader } from './recordReader';

interface RowMatch {
  field: string;
  is: string[];
}

interface OfficerColumns {
  name: string[];
  title:
    | { text: string }
    | { field: string; blank?: string; separator?: string };
  unless?: RowMatch;
}

interface Status {
  columns: string[];
  read: (reader: RecordReader) => string | null;
}

interface CommonAdapter {
  dataset: string;
  state: string;
  url: string;
  zipped?: boolean;
  published?: { url: string; date: (metadata: unknown) => string };
  skip?: RowMatch;
  registeredAgent?: { name: string[]; otherwise?: string[]; when?: RowMatch };
  officers: OfficerColumns[];
}

export interface EntityAdapter extends CommonAdapter {
  entityNumber: string;
  sourceId?: string;
  name: string;
  status?: Status;
  activeOnly?: true;
  formationDate?: { field: string; format: 'mdy' | 'ymd' };
  address?: {
    line1: string;
    city: string;
    state: string;
    zip: string;
    when?: RowMatch;
  };
}

export interface DetailAdapter extends CommonAdapter {
  attach: string;
}

type RegistryAdapter = EntityAdapter | DetailAdapter;

type RegistryEntity = Omit<
  TablesInsert<'state_registry_entity'>,
  'id' | 'business_id' | 'import_id' | 'source' | 'fetched_at'
>;

type Officer = {
  name: string;
  title: string | null;
};

export interface RegistryEntry {
  entity: RegistryEntity;
  officers: Officer[];
}

export type RegistryDetail = {
  source_id: string;
  registered_agent: string | null;
  officers: Officer[];
  rows: number;
};

const socrata = (domain: string, id: string) =>
  `https://${domain}/api/views/${id}/rows.csv?accessType=DOWNLOAD`;

const statusField = (field: string): Status => ({
  columns: [field],
  read: (reader) => reader.text(field),
});

const LISTED_AS_ACTIVE: Status = { columns: [], read: () => 'active' };

const TEXAS_SOS_STATUS = 'SOS Status Code';
const TEXAS_RIGHT_TO_TRANSACT = 'Right to Transact Business Code';

const TEXAS_INACTIVE_SOS: Record<string, string> = {
  D: 'dissolved',
  E: 'expired',
  F: 'forfeited franchise tax',
  K: 'forfeited registered agent',
  L: 'forfeited registered office',
  N: 'forfeited hot check',
  P: 'forfeited court order',
  T: 'terminated',
  W: 'withdrawn',
  M: 'merged',
  B: 'consolidated',
  C: 'converted',
  I: 'closed by FDIC',
  J: 'state charter pulled',
  Y: 'dead at conversion',
  Z: 'dead at conversion',
};

const TEXAS_INACTIVE_RIGHT_TO_TRANSACT: Record<string, string> = {
  N: 'right to transact forfeited',
  I: 'franchise tax involuntarily ended',
};

const TEXAS_STATUS: Status = {
  columns: [TEXAS_SOS_STATUS, TEXAS_RIGHT_TO_TRANSACT],
  read: (reader) => {
    const reason =
      TEXAS_INACTIVE_SOS[reader.text(TEXAS_SOS_STATUS) ?? ''] ??
      TEXAS_INACTIVE_RIGHT_TO_TRANSACT[
        reader.text(TEXAS_RIGHT_TO_TRANSACT) ?? ''
      ];
    return reason === undefined ? 'active' : `inactive (${reason})`;
  },
};

const OREGON_ROW_TYPE = 'Associated Name Type';
const OREGON_PERSON = ['First Name', 'Middle Name', 'Last Name', 'Suffix'];
const OREGON_PEOPLE: OfficerColumns = {
  name: [...OREGON_PERSON, 'Entity of Record Name'],
  title: { field: OREGON_ROW_TYPE },
  unless: {
    field: OREGON_ROW_TYPE,
    is: [
      'REGISTERED AGENT',
      'PRINCIPAL PLACE OF BUSINESS',
      'MAILING ADDRESS',
      'RECORDS OFFICE',
    ],
  },
};
const OREGON_SKIP: RowMatch = {
  field: 'Entity Type',
  is: ['ASSUMED BUSINESS NAME'],
};

const REGISTRY_ADAPTERS: RegistryAdapter[] = [
  {
    dataset: 'NY',
    state: 'NY',
    url: socrata('data.ny.gov', 'n9v6-gdp6'),
    entityNumber: 'DOS ID',
    name: 'Current Entity Name',
    formationDate: { field: 'Initial DOS Filing Date', format: 'mdy' },
    registeredAgent: { name: ['Registered Agent Name'] },
    officers: [{ name: ['CEO Name'], title: { text: 'CEO' } }],
  },
  {
    dataset: 'CO',
    state: 'CO',
    url: socrata('data.colorado.gov', '4ykn-tg5h'),
    entityNumber: 'entityid',
    name: 'entityname',
    status: statusField('entitystatus'),
    formationDate: { field: 'entityformdate', format: 'mdy' },
    registeredAgent: {
      name: [
        'agentfirstname',
        'agentmiddlename',
        'agentlastname',
        'agentsuffix',
        'agentorganizationname',
      ],
    },
    address: {
      line1: 'principaladdress1',
      city: 'principalcity',
      state: 'principalstate',
      zip: 'principalzipcode',
    },
    officers: [],
  },
  {
    dataset: 'PA',
    state: 'PA',
    url: socrata('data.pa.gov', 'xvd7-5r2c'),
    entityNumber: 'Filing Number',
    name: 'Business Name',
    formationDate: { field: 'Creation Date', format: 'mdy' },
    officers: [
      {
        name: ['First Name', 'Middle Name', 'Last Name'],
        title: { field: 'Governor/Principal Officer' },
      },
    ],
  },
  {
    dataset: 'CT',
    state: 'CT',
    url: socrata('data.ct.gov', 'n7gp-d28j'),
    entityNumber: 'AccountNumber',
    sourceId: 'Id',
    name: 'Name',
    status: statusField('Status'),
    formationDate: { field: 'Date_Registration', format: 'mdy' },
    address: {
      line1: 'Business_Street',
      city: 'Business_City',
      state: 'Business_State',
      zip: 'Business_ZIP',
    },
    officers: [],
  },
  {
    dataset: 'CT principals',
    state: 'CT',
    url: socrata('data.ct.gov', 'ka36-64k6'),
    attach: 'Unique_Key',
    officers: [
      {
        name: ['Principal Name'],
        title: { field: 'Designation', blank: 'Principal', separator: ';' },
      },
    ],
  },
  {
    dataset: 'CT agents',
    state: 'CT',
    url: socrata('data.ct.gov', 'qh2m-n44y'),
    attach: 'Unique Key',
    registeredAgent: { name: ['Agent Name'] },
    officers: [],
  },
  {
    dataset: 'TX',
    state: 'TX',
    url: socrata('data.texas.gov', '9cir-efmm'),
    entityNumber: 'Secretary of State (SOS) or COA File Number',
    name: 'Taxpayer Name',
    status: TEXAS_STATUS,
    formationDate: { field: 'SOS Charter Date', format: 'mdy' },
    address: {
      line1: 'Taxpayer Address',
      city: 'Taxpayer City',
      state: 'Taxpayer State',
      zip: 'Taxpayer Zip',
    },
    officers: [],
  },
  {
    dataset: 'IA',
    state: 'IA',
    url: 'https://idh-be.iowa.gov/api/v1/datasets/554/rows.csv',
    zipped: true,
    published: {
      url: 'https://idh-be.iowa.gov/api/v1/datasets/554/',
      date: (metadata) =>
        z
          .object({ data: z.object({ lastUpdated: z.string() }) })
          .parse(metadata)
          .data.lastUpdated.slice(0, 10),
    },
    entityNumber: 'corp_number',
    name: 'legal_name',
    status: LISTED_AS_ACTIVE,
    activeOnly: true,
    formationDate: { field: 'effective_date', format: 'ymd' },
    registeredAgent: { name: ['registered_agent'] },
    address: {
      line1: 'ho_address_1',
      city: 'ho_city',
      state: 'ho_state',
      zip: 'ho_zip',
    },
    officers: [],
  },
  {
    dataset: 'DC',
    state: 'DC',
    url: 'https://opendata.dc.gov/api/download/v1/items/5238c4fd99c843a1bd7679a243747a8c/csv?layers=0',
    entityNumber: 'FILE_NUMBER',
    name: 'BUSINESS_NAME',
    status: statusField('ENTITY_STATUS'),
    formationDate: { field: 'EFFECTIVE_DATE', format: 'ymd' },
    registeredAgent: { name: ['RA_NAME'] },
    address: {
      line1: 'BUSNIESS_ADDRESS_LINE1',
      city: 'BUSINESS_CITY',
      state: 'BUSINESS_STATE',
      zip: 'ZIPCODE',
    },
    officers: [],
  },
  {
    dataset: 'OR',
    state: 'OR',
    url: socrata('data.oregon.gov', 'tckn-sxa6'),
    skip: OREGON_SKIP,
    entityNumber: 'Registry Number',
    sourceId: 'Registry Number',
    name: 'Business Name',
    status: LISTED_AS_ACTIVE,
    activeOnly: true,
    formationDate: { field: 'Registry Date', format: 'mdy' },
    registeredAgent: {
      name: ['Entity of Record Name'],
      otherwise: OREGON_PERSON,
      when: { field: OREGON_ROW_TYPE, is: ['REGISTERED AGENT'] },
    },
    address: {
      line1: 'Address',
      city: 'City',
      state: 'State',
      zip: 'Zip',
      when: { field: OREGON_ROW_TYPE, is: ['PRINCIPAL PLACE OF BUSINESS'] },
    },
    officers: [OREGON_PEOPLE],
  },
  {
    dataset: 'OR officers',
    state: 'OR',
    url: socrata('data.oregon.gov', 'esjy-u4fc'),
    skip: OREGON_SKIP,
    attach: 'Registry Number',
    officers: [OREGON_PEOPLE],
  },
];

function joined(reader: RecordReader, names: string[]): string | null {
  const parts = names.flatMap((name) => reader.text(name) ?? []);
  return parts.length === 0 ? null : parts.join(' ');
}

function matches(reader: RecordReader, match: RowMatch | undefined): boolean {
  return (
    match === undefined ||
    match.is.some((value) => value === reader.text(match.field))
  );
}

function skipped(reader: RecordReader, adapter: RegistryAdapter): boolean {
  return adapter.skip !== undefined && matches(reader, adapter.skip);
}

function formationDate(
  reader: RecordReader,
  date: EntityAdapter['formationDate'],
): string | null {
  if (!date) return null;
  return date.format === 'mdy'
    ? reader.usDate(date.field)
    : reader.isoDate(date.field);
}

function registeredAgent(
  reader: RecordReader,
  adapter: RegistryAdapter,
): string | null {
  const agent = adapter.registeredAgent;
  if (!agent || !matches(reader, agent.when)) return null;
  return (
    joined(reader, agent.name) ??
    (agent.otherwise ? joined(reader, agent.otherwise) : null)
  );
}

function titles(
  reader: RecordReader,
  title: OfficerColumns['title'],
): (string | null)[] {
  if ('text' in title) return [title.text];
  const value = reader.text(title.field) ?? title.blank ?? null;
  return value !== null && title.separator
    ? value.split(title.separator).map((part) => part.trim())
    : [value];
}

function officers(reader: RecordReader, adapter: RegistryAdapter): Officer[] {
  return adapter.officers.flatMap(({ name, title, unless }) => {
    const officer = joined(reader, name);
    if (officer === null || (unless && matches(reader, unless))) return [];
    return titles(reader, title).map((text) => ({
      name: officer,
      title: text,
    }));
  });
}

export function parseRegistry(adapter: EntityAdapter) {
  return (reader: RecordReader): RegistryEntry | null => {
    if (skipped(reader, adapter)) return null;
    const address =
      adapter.address && matches(reader, adapter.address.when)
        ? adapter.address
        : undefined;
    return {
      entity: {
        state: adapter.state,
        entity_number: reader.required(adapter.entityNumber),
        source_id: adapter.sourceId ? reader.text(adapter.sourceId) : null,
        name: reader.required(adapter.name),
        status: adapter.status ? adapter.status.read(reader) : null,
        formation_date: formationDate(reader, adapter.formationDate),
        registered_agent: registeredAgent(reader, adapter),
        mailing_address_line1: address ? reader.text(address.line1) : null,
        mailing_city: address ? reader.text(address.city) : null,
        mailing_state: address ? reader.text(address.state) : null,
        mailing_postal_code: address ? reader.text(address.zip) : null,
      },
      officers: officers(reader, adapter),
    };
  };
}

export function parseRegistryDetail(adapter: DetailAdapter) {
  return (reader: RecordReader): RegistryDetail | null => {
    if (skipped(reader, adapter)) return null;
    return {
      source_id: reader.required(adapter.attach),
      registered_agent: registeredAgent(reader, adapter),
      officers: officers(reader, adapter),
      rows: 1,
    };
  };
}

function matchColumns(match: RowMatch | undefined): string[] {
  return match ? [match.field] : [];
}

export function registryColumns(adapter: RegistryAdapter): string[] {
  const shared = [
    ...matchColumns(adapter.skip),
    ...(adapter.registeredAgent
      ? [
          ...adapter.registeredAgent.name,
          ...(adapter.registeredAgent.otherwise ?? []),
          ...matchColumns(adapter.registeredAgent.when),
        ]
      : []),
    ...adapter.officers.flatMap(({ name, title, unless }) => [
      ...name,
      ...('field' in title ? [title.field] : []),
      ...matchColumns(unless),
    ]),
  ];
  if ('attach' in adapter) return [adapter.attach, ...shared];
  return [
    adapter.entityNumber,
    adapter.name,
    ...(adapter.sourceId ? [adapter.sourceId] : []),
    ...(adapter.status?.columns ?? []),
    ...(adapter.formationDate ? [adapter.formationDate.field] : []),
    ...(adapter.address
      ? [
          adapter.address.line1,
          adapter.address.city,
          adapter.address.state,
          adapter.address.zip,
          ...matchColumns(adapter.address.when),
        ]
      : []),
    ...shared,
  ];
}

export function suppliedFields(adapter: EntityAdapter): string[] {
  return [
    ...(adapter.sourceId ? ['source_id'] : []),
    ...(adapter.status ? ['status'] : []),
    ...(adapter.formationDate ? ['formation_date'] : []),
    ...(adapter.registeredAgent ? ['registered_agent'] : []),
    ...(adapter.address
      ? [
          'mailing_address_line1',
          'mailing_city',
          'mailing_state',
          'mailing_postal_code',
        ]
      : []),
  ];
}

export function registryAdapter(dataset: string): RegistryAdapter {
  return REGISTRY_ADAPTERS.find((adapter) => adapter.dataset === dataset)!;
}

export function registryFiles(): Extract<
  LeadFileRef,
  { kind: 'state_registry' }
>[] {
  return REGISTRY_ADAPTERS.map((adapter) => ({
    kind: 'state_registry',
    dataset: adapter.dataset,
    url: adapter.url,
    ...('attach' in adapter
      ? {
          parent: REGISTRY_ADAPTERS.find(
            (main) => main.state === adapter.state && !('attach' in main),
          )!.dataset,
        }
      : {}),
  }));
}
