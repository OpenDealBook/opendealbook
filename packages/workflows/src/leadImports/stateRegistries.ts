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
  when?: RowMatch;
}

interface Status {
  columns: string[];
  read: (reader: RecordReader) => string | null;
  mostRestrictiveFirst?: string[];
}

interface Address {
  line1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
}

interface AddressSource {
  columns: string[];
  read: (reader: RecordReader) => Address | null;
}

interface CommonAdapter {
  dataset: string;
  state: string;
  url: string;
  zipped?: boolean;
  published?: { url: string; date: (metadata: unknown) => string };
  skip?: RowMatch;
  registeredAgent?: {
    name: string[];
    otherwise?: string[];
    when?: RowMatch;
    vacant?: string[];
  };
  officers: OfficerColumns[];
  status?: Status;
  principalAddress?: AddressSource;
  filing?: string[];
}

export interface EntityAdapter extends CommonAdapter {
  entityNumber: string;
  sourceId?: string;
  name: string;
  activeOnly?: true;
  formationDate?: {
    field: string;
    format: 'mdy' | 'ymd';
    placeholder?: string;
  };
  entityType?: { field: string; labels?: Record<string, string> };
  mailingAddress?: AddressSource;
  alias?: string;
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
  filing?: string;
}

type DetailPart = 'agent' | 'officers' | 'status' | 'principal';

export type RegistryDetail = {
  source_id: string;
  registered_agent: string | null;
  registered_agent_vacant: boolean;
  officers: Officer[];
  status: string | null;
  principal_address_line1: string | null;
  principal_city: string | null;
  principal_state: string | null;
  principal_postal_code: string | null;
  rows: number;
  filed?: Record<DetailPart, string>;
};

const socrata = (domain: string, id: string) =>
  `https://${domain}/api/views/${id}/rows.csv?accessType=DOWNLOAD`;

const nyFilingHistory = (
  id: string,
  query: { $select: string; $where: string },
) =>
  `https://data.ny.gov/resource/${id}.csv?${new URLSearchParams({
    $order: 'corpid_num,date_filed,film_num',
    ...query,
    $limit: '100000000',
  })}`;

const NY_FILING = ['date_filed', 'film_num'];

const nyAddressType = (code: string): RowMatch => ({
  field: 'addr_type',
  is: [code],
});

const statusField = (field: string): Status => ({
  columns: [field],
  read: (reader) => reader.text(field),
});

const addressColumns = (columns: {
  line1: string;
  city: string;
  state: string;
  zip: string;
  when?: RowMatch;
}): AddressSource => ({
  columns: [
    columns.line1,
    columns.city,
    columns.state,
    columns.zip,
    ...matchColumns(columns.when),
  ],
  read: (reader) =>
    matches(reader, columns.when)
      ? {
          line1: reader.text(columns.line1),
          city: reader.text(columns.city),
          state: reader.text(columns.state),
          postalCode: reader.text(columns.zip),
        }
      : null,
});

const CONNECTICUT_MAILING_ADDRESS = 'Mailing_Address';

// Joined as "street , unit ,city ,state ,country ,zip"; the street may hold commas.
const CONNECTICUT_MAILING: AddressSource = {
  columns: [CONNECTICUT_MAILING_ADDRESS],
  read: (reader) => {
    const parts = (reader.text(CONNECTICUT_MAILING_ADDRESS) ?? '')
      .split(',')
      .map((part) => part.trim());
    const [unit, city, state, , postalCode] = parts.slice(-5);
    return {
      line1: [...parts.slice(0, -5), unit].filter(Boolean).join(', ') || null,
      city: city || null,
      state: state || null,
      postalCode: postalCode || null,
    };
  },
};

const LISTED_AS_ACTIVE: Status = { columns: [], read: () => 'active' };

const TEXAS_SOS_STATUS = 'SOS Status Code';
const TEXAS_RIGHT_TO_TRANSACT = 'Right to Transact Business Code';

const TEXAS_ENTITY_TYPES: Record<string, string> = {
  AB: 'TEXAS BUSINESS ASSOC',
  AC: 'FRGN BUSINESS ASSOC',
  AF: 'FOREIGN PROFESSIONAL ASSOCIATION',
  AP: 'TEXAS PROFESSIONAL ASSOCIATION',
  AR: 'OTHER ASSOCIATION',
  C: 'CORPORATION',
  CF: 'FOREIGN PROFIT CORPORATION',
  CI: 'FOREIGN LMTD LIAB CO - OOS',
  CL: 'TEXAS LIMITED LIABILITY COMPANY',
  CM: 'FOREIGN NON-PROFIT CORP - OOS',
  CN: 'TEXAS NON-PROFIT CORPORATION',
  CP: 'TEXAS PROFESSIONAL CORPORATION',
  CR: 'TEXAS INSURANCE CORPORATION',
  CS: 'FOREIGN INSURANCE CORP - OOS',
  CT: 'TEXAS PROFIT CORPORATION',
  CU: 'FOREIGN PROFESSIONAL CORPORATION',
  CW: 'TEXAS RAILROAD CORPORATION',
  CX: 'FOREIGN RAILROAD CORPORATION',
  DC: 'REGISTERED DATA CENTER',
  ES: 'ESTATE',
  FA: 'FINANCIAL INSTITUTION - STATE SAVINGS & LOAN - OOS',
  FB: 'FINANCIAL INSTITUTION - STATE SAVINGS BANK - TX',
  FC: 'FINANCIAL INSTITUTION - FEDERAL CREDIT UNION',
  FD: 'FINANCIAL INSTITUTION - STATE SAVINGS & LOAN - TX',
  FE: 'FINANCIAL INSTITUTION - FEDERAL SAVINGS & LOAN - TX',
  FF: 'FINANCIAL INSTITUTION - FEDERAL BANK - TX',
  FG: 'FINANCIAL INSTITUTION - FEDERAL SAVINGS BANK - TX',
  FH: 'FINANCIAL INSTITUTION - STATE SAVINGS BANK - OOS',
  FI: 'FINANCIAL INSTITUTION - STATE CREDIT UNION - TX',
  FJ: 'FINANCIAL INSTITUTION - FEDERAL BANK - OOS',
  FK: 'FINANCIAL INSTITUTION - FEDERAL SAVINGS BANK - OOS',
  FL: 'FINANCIAL INSTITUTION - STATE LIMITED BANK ASSOC',
  FM: 'FINANCIAL INSTITUTION - TRUST COMPANY',
  FN: 'FINANCIAL INSTITUTION - FEDERAL SAVINGS & LOAN - OOS',
  FO: 'FINANCIAL INSTITUTION - STATE BANK - OOS',
  FP: 'FINANCIAL INSTITUTION',
  FR: 'FINANCIAL INSTITUTION - FOREIGN COUNTRY BANK',
  FS: 'FINANCIAL INSTITUTION - STATE BANK - TX',
  FT: 'FINANCIAL INSTITUTION - STATE CREDIT UNION - OOS',
  GC: 'CITY',
  GD: 'FEDERAL AGENCY',
  GF: 'STATE AGENCY - OOS',
  GJ: 'JUNIOR COLLEGE',
  GL: 'LOCAL OFFICIAL',
  GM: 'MASS TRANSIT',
  GO: 'COUNTY',
  GP: 'SPECIAL PURPOSE DISTRICT',
  GR: 'RAPID TRANSIT',
  GS: 'SCHOOL DISTRICT',
  GT: 'STATE AGENCY - TX',
  GU: 'STATE COLLEGE/UNIVERSITY',
  GY: 'COMMUNITY COLLEGE',
  HF: 'FRGN HOLDING COMPANY',
  HS: 'HISTORIC STRUCTURE',
  IS: 'INDIVIDUAL - SOLE OWNER',
  J: 'JOINT VENTURE',
  L: 'LIMITED (LIABILITY) COMPANY',
  M: 'LIMITED (LIABILITY) PARTNERSHIP',
  O: 'OTHER',
  P: 'GENERAL PARTNERSHIP',
  PB: 'BUS GENERAL PRTNSHP',
  PF: 'FRGN LIMITED PRTNSHP',
  PI: 'IND GENERAL PRTNSHP',
  PL: 'TX LIMITED PRTNSHP',
  PO: 'OIL & GAS SPECIAL',
  PV: 'TEXAS JOINT VENTURE',
  PW: 'FRGN JOINT VENTURE',
  PX: 'TX LLP REGISTRATION',
  PY: 'FRGN LLP REGISTRATION',
  PZ: 'IND SUCCESSOR PRTSHP',
  S: 'SOLE PROPRIETORSHIP',
  SF: 'FRGN JOINT STOCK CO',
  ST: 'TEXAS JOINT STOCK CO',
  TF: 'FOREIGN BUSINESS TRUST',
  TH: 'TX RL EST INV TRST',
  TI: 'FOREIGN REAL ESTATE INVESTMENT TRUST',
  TR: 'TRUST',
  UF: 'UNKNOWN - FRANCHISE',
  UK: 'UNKNOWN',
};

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
const oregonAddress = (rowType: string) =>
  addressColumns({
    line1: 'Address',
    city: 'City',
    state: 'State',
    zip: 'Zip',
    when: { field: OREGON_ROW_TYPE, is: [rowType] },
  });
const OREGON_SKIP: RowMatch = {
  field: 'Entity Type',
  is: ['ASSUMED BUSINESS NAME'],
};

const REGISTRY_ADAPTERS: RegistryAdapter[] = [
  {
    dataset: 'NY',
    state: 'NY',
    url: nyFilingHistory('63wc-4exh', {
      $select: 'corpid_num,date_filed,film_num,entitytype,corp_name,fict_name',
      $where: 'corpid_num IS NOT NULL AND corp_name IS NOT NULL',
    }),
    entityNumber: 'corpid_num',
    sourceId: 'corpid_num',
    name: 'corp_name',
    alias: 'fict_name',
    filing: NY_FILING,
    formationDate: {
      field: 'date_filed',
      format: 'ymd',
      placeholder: '1900-01-01',
    },
    entityType: { field: 'entitytype' },
    officers: [],
  },
  {
    dataset: 'NY status',
    state: 'NY',
    url: nyFilingHistory('3gg2-jgnp', {
      $select: 'corpid_num,date_filed,film_num,status',
      $where: 'corpid_num IS NOT NULL AND status IS NOT NULL',
    }),
    attach: 'corpid_num',
    filing: NY_FILING,
    status: {
      ...statusField('status'),
      mostRestrictiveFirst: ['inactive', 'discontinued', 'suspended', 'active'],
    },
    officers: [],
  },
  {
    dataset: 'NY addresses',
    state: 'NY',
    url: nyFilingHistory('2tms-hftb', {
      $select:
        'corpid_num,date_filed,film_num,addr_type,name,addr1,city,state,zip5',
      $where: 'corpid_num IS NOT NULL AND addr_type IN (2, 3, 4)',
    }),
    attach: 'corpid_num',
    filing: NY_FILING,
    registeredAgent: {
      name: ['name'],
      when: nyAddressType('2'),
      vacant: ['REGISTERED AGENT REVOKED', 'REGISTERED AGENT RESIGNED'],
    },
    officers: [
      { name: ['name'], title: { text: 'CEO' }, when: nyAddressType('3') },
    ],
    principalAddress: addressColumns({
      line1: 'addr1',
      city: 'city',
      state: 'state',
      zip: 'zip5',
      when: nyAddressType('4'),
    }),
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
    entityType: { field: 'entitytype' },
    principalAddress: addressColumns({
      line1: 'principaladdress1',
      city: 'principalcity',
      state: 'principalstate',
      zip: 'principalzipcode',
    }),
    mailingAddress: addressColumns({
      line1: 'mailingaddress1',
      city: 'mailingcity',
      state: 'mailingstate',
      zip: 'mailingzipcode',
    }),
    officers: [],
  },
  {
    dataset: 'PA',
    state: 'PA',
    url: socrata('data.pa.gov', 'xvd7-5r2c'),
    entityNumber: 'Filing Number',
    name: 'Business Name',
    formationDate: { field: 'Creation Date', format: 'mdy' },
    entityType: { field: 'Type of Business Registration' },
    principalAddress: addressColumns({
      line1: 'Address Line 1',
      city: 'City',
      state: 'State',
      zip: 'Zip',
    }),
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
    entityType: { field: 'Business_Type' },
    principalAddress: addressColumns({
      line1: 'Business_Street',
      city: 'Business_City',
      state: 'Business_State',
      zip: 'Business_ZIP',
    }),
    mailingAddress: CONNECTICUT_MAILING,
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
    entityType: {
      field: 'Taxpayer Organizational Type',
      labels: TEXAS_ENTITY_TYPES,
    },
    mailingAddress: addressColumns({
      line1: 'Taxpayer Address',
      city: 'Taxpayer City',
      state: 'Taxpayer State',
      zip: 'Taxpayer Zip',
    }),
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
    entityType: { field: 'corporation_type' },
    principalAddress: addressColumns({
      line1: 'ho_address_1',
      city: 'ho_city',
      state: 'ho_state',
      zip: 'ho_zip',
    }),
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
    entityType: { field: 'MODELTYPE' },
    principalAddress: addressColumns({
      line1: 'BUSNIESS_ADDRESS_LINE1',
      city: 'BUSINESS_CITY',
      state: 'BUSINESS_STATE',
      zip: 'ZIPCODE',
    }),
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
    entityType: { field: 'Entity Type' },
    principalAddress: oregonAddress('PRINCIPAL PLACE OF BUSINESS'),
    mailingAddress: oregonAddress('MAILING ADDRESS'),
    officers: [
      {
        name: [...OREGON_PERSON, 'Entity of Record Name'],
        title: { text: 'Authorized Representative' },
        when: { field: OREGON_ROW_TYPE, is: ['AUTHORIZED REPRESENTATIVE'] },
      },
    ],
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
  const parsed =
    date.format === 'mdy'
      ? reader.usDate(date.field)
      : reader.isoDate(date.field);
  return parsed === date.placeholder ? null : parsed;
}

function filing(reader: RecordReader, adapter: RegistryAdapter) {
  return adapter.filing
    ? adapter.filing.map((field) => reader.text(field) ?? '').join(' ')
    : null;
}

function entityType(
  reader: RecordReader,
  type: EntityAdapter['entityType'],
): string | null {
  if (!type) return null;
  const value = reader.text(type.field);
  return value !== null && type.labels ? (type.labels[value] ?? value) : value;
}

function namedAgent(
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

function agentVacant(reader: RecordReader, adapter: RegistryAdapter) {
  const named = namedAgent(reader, adapter);
  return (
    named !== null &&
    (adapter.registeredAgent?.vacant ?? []).includes(named.toUpperCase())
  );
}

function registeredAgent(
  reader: RecordReader,
  adapter: RegistryAdapter,
): string | null {
  return agentVacant(reader, adapter) ? null : namedAgent(reader, adapter);
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
  return adapter.officers.flatMap(({ name, title, when }) => {
    const officer = joined(reader, name);
    if (officer === null || !matches(reader, when)) return [];
    return titles(reader, title).map((text) => ({
      name: officer,
      title: text,
    }));
  });
}

export function parseRegistry(adapter: EntityAdapter) {
  return (reader: RecordReader): RegistryEntry | null => {
    if (skipped(reader, adapter)) return null;
    const principal = adapter.principalAddress?.read(reader) ?? null;
    const mailing = adapter.mailingAddress?.read(reader) ?? null;
    const alias = adapter.alias ? reader.text(adapter.alias) : null;
    const filed = filing(reader, adapter);
    return {
      entity: {
        state: adapter.state,
        entity_number: reader.required(adapter.entityNumber),
        source_id: adapter.sourceId ? reader.text(adapter.sourceId) : null,
        name: reader.required(adapter.name),
        status: adapter.status ? adapter.status.read(reader) : null,
        formation_date: formationDate(reader, adapter.formationDate),
        registered_agent: registeredAgent(reader, adapter),
        entity_type: entityType(reader, adapter.entityType),
        principal_address_line1: principal?.line1 ?? null,
        principal_city: principal?.city ?? null,
        principal_state: principal?.state ?? null,
        principal_postal_code: principal?.postalCode ?? null,
        mailing_address_line1: mailing?.line1 ?? null,
        mailing_city: mailing?.city ?? null,
        mailing_state: mailing?.state ?? null,
        mailing_postal_code: mailing?.postalCode ?? null,
        ...(alias === null ? {} : { aliases: [alias] }),
      },
      officers: officers(reader, adapter),
      ...(filed === null ? {} : { filing: filed }),
    };
  };
}

export function parseRegistryDetail(adapter: DetailAdapter) {
  return (reader: RecordReader): RegistryDetail | null => {
    if (skipped(reader, adapter)) return null;
    const principal = adapter.principalAddress?.read(reader) ?? null;
    const filed = filing(reader, adapter);
    return {
      source_id: reader.required(adapter.attach),
      registered_agent: registeredAgent(reader, adapter),
      registered_agent_vacant: agentVacant(reader, adapter),
      officers: officers(reader, adapter),
      status: adapter.status ? adapter.status.read(reader) : null,
      principal_address_line1: principal?.line1 ?? null,
      principal_city: principal?.city ?? null,
      principal_state: principal?.state ?? null,
      principal_postal_code: principal?.postalCode ?? null,
      rows: 1,
      ...(filed === null
        ? {}
        : {
            filed: {
              agent: filed,
              officers: filed,
              status: filed,
              principal: filed,
            },
          }),
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
    ...adapter.officers.flatMap(({ name, title, when }) => [
      ...name,
      ...('field' in title ? [title.field] : []),
      ...matchColumns(when),
    ]),
  ];
  const statusAndPrincipal = [
    ...(adapter.filing ?? []),
    ...(adapter.status?.columns ?? []),
    ...(adapter.principalAddress?.columns ?? []),
  ];
  if ('attach' in adapter)
    return [adapter.attach, ...statusAndPrincipal, ...shared];
  return [
    adapter.entityNumber,
    adapter.name,
    ...(adapter.sourceId ? [adapter.sourceId] : []),
    ...statusAndPrincipal,
    ...(adapter.formationDate ? [adapter.formationDate.field] : []),
    ...(adapter.entityType ? [adapter.entityType.field] : []),
    ...(adapter.mailingAddress?.columns ?? []),
    ...(adapter.alias ? [adapter.alias] : []),
    ...shared,
  ];
}

export function suppliedFields(adapter: EntityAdapter): string[] {
  return [
    ...(adapter.sourceId ? ['source_id'] : []),
    ...(adapter.status ? ['status'] : []),
    ...(adapter.formationDate ? ['formation_date'] : []),
    ...(adapter.registeredAgent ? ['registered_agent'] : []),
    ...(adapter.entityType ? ['entity_type'] : []),
    ...(adapter.alias ? ['aliases'] : []),
    ...(adapter.principalAddress
      ? [
          'principal_address_line1',
          'principal_city',
          'principal_state',
          'principal_postal_code',
        ]
      : []),
    ...(adapter.mailingAddress
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

function coalesced<T extends object>(earlier: T, later: T): T {
  return {
    ...earlier,
    ...Object.fromEntries(
      Object.entries(later).filter(([, value]) => value !== null),
    ),
  };
}

const FILINGS = new Intl.Collator('en', { numeric: true });

function laterIsNewer(earlier?: string, later?: string): number {
  return earlier === undefined || later === undefined
    ? 1
    : FILINGS.compare(later, earlier);
}

const earliest = (...dates: (string | null | undefined)[]) =>
  dates.filter((date) => date != null).sort()[0] ?? null;

export function mergeRegistryEntry(
  earlier: RegistryEntry,
  later: RegistryEntry,
): RegistryEntry {
  const [older, newer] =
    laterIsNewer(earlier.filing, later.filing) >= 0
      ? [earlier, later]
      : [later, earlier];
  return {
    ...newer,
    entity: {
      ...coalesced(older.entity, newer.entity),
      formation_date: earliest(
        older.entity.formation_date,
        newer.entity.formation_date,
      ),
    },
    officers: [...earlier.officers, ...later.officers],
  };
}

const principalAddress = (row: RegistryDetail) => ({
  principal_address_line1: row.principal_address_line1,
  principal_city: row.principal_city,
  principal_state: row.principal_state,
  principal_postal_code: row.principal_postal_code,
});

const SUPPLIES: Record<DetailPart, (row: RegistryDetail) => boolean> = {
  agent: (row) => row.registered_agent !== null || row.registered_agent_vacant,
  officers: (row) => row.officers.length > 0,
  status: (row) => row.status !== null,
  principal: (row) =>
    Object.values(principalAddress(row)).some((part) => part !== null),
};

export function mergeRegistryDetail(adapter: DetailAdapter) {
  const restrictiveness = (row: RegistryDetail) => {
    const rank = (adapter.status?.mostRestrictiveFirst ?? []).indexOf(
      row.status?.toLowerCase() ?? '',
    );
    return rank === -1 ? Infinity : rank;
  };
  return (earlier: RegistryDetail, later: RegistryDetail): RegistryDetail => {
    const order = (part: DetailPart) =>
      !SUPPLIES[part](later)
        ? -1
        : !SUPPLIES[part](earlier)
          ? 1
          : laterIsNewer(earlier.filed?.[part], later.filed?.[part]);
    const tied = (part: DetailPart) => order(part) === 0;
    const newer = (part: DetailPart) => (order(part) >= 0 ? later : earlier);
    const agents = [
      ...new Set(
        [earlier.registered_agent, later.registered_agent].filter(
          (name) => name !== null,
        ),
      ),
    ];
    const filed = (
      older: Record<DetailPart, string>,
      newest: Record<DetailPart, string>,
    ) => ({
      agent: (order('agent') >= 0 ? newest : older).agent,
      officers: (order('officers') >= 0 ? newest : older).officers,
      status: (order('status') >= 0 ? newest : older).status,
      principal: (order('principal') >= 0 ? newest : older).principal,
    });
    return {
      source_id: earlier.source_id,
      registered_agent: tied('agent')
        ? agents.join('; ') || null
        : newer('agent').registered_agent,
      registered_agent_vacant: tied('agent')
        ? agents.length === 0
        : newer('agent').registered_agent_vacant,
      officers:
        tied('officers') || later.filed === undefined
          ? [...earlier.officers, ...later.officers]
          : newer('officers').officers,
      status:
        tied('status') && restrictiveness(earlier) < restrictiveness(later)
          ? earlier.status
          : newer('status').status,
      ...principalAddress(newer('principal')),
      rows: earlier.rows + later.rows,
      ...(earlier.filed && later.filed
        ? { filed: filed(earlier.filed, later.filed) }
        : {}),
    };
  };
}
