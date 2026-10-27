import { z } from 'zod';

import type { TablesInsert } from '@odb/supabase';

import type { LeadFileRef } from './files';
import type { RecordReader } from './recordReader';

interface RegistryAdapter {
  state: string;
  url: string;
  zipped?: boolean;
  published?: { url: string; date: (metadata: unknown) => string };
  entityNumber: string;
  name: string;
  status?: string;
  formationDate?: { field: string; format: 'mdy' | 'ymd' };
  registeredAgent?: string[];
  address?: { line1: string; city: string; state: string; zip: string };
  officers: { name: string[]; title: { text: string } | { field: string } }[];
}

type RegistryEntity = Omit<
  TablesInsert<'state_registry_entity'>,
  'id' | 'business_id' | 'import_id' | 'source' | 'fetched_at'
>;

export interface RegistryEntry {
  entity: RegistryEntity;
  officers: { name: string; title: string | null }[];
}

const socrata = (domain: string, id: string) =>
  `https://${domain}/api/views/${id}/rows.csv?accessType=DOWNLOAD`;

export const REGISTRY_ADAPTERS: RegistryAdapter[] = [
  {
    state: 'NY',
    url: socrata('data.ny.gov', 'n9v6-gdp6'),
    entityNumber: 'DOS ID',
    name: 'Current Entity Name',
    formationDate: { field: 'Initial DOS Filing Date', format: 'mdy' },
    registeredAgent: ['Registered Agent Name'],
    officers: [{ name: ['CEO Name'], title: { text: 'CEO' } }],
  },
  {
    state: 'CO',
    url: socrata('data.colorado.gov', '4ykn-tg5h'),
    entityNumber: 'entityid',
    name: 'entityname',
    status: 'entitystatus',
    formationDate: { field: 'entityformdate', format: 'mdy' },
    registeredAgent: [
      'agentfirstname',
      'agentmiddlename',
      'agentlastname',
      'agentsuffix',
      'agentorganizationname',
    ],
    address: {
      line1: 'principaladdress1',
      city: 'principalcity',
      state: 'principalstate',
      zip: 'principalzipcode',
    },
    officers: [],
  },
  {
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
    state: 'CT',
    url: socrata('data.ct.gov', 'n7gp-d28j'),
    entityNumber: 'AccountNumber',
    name: 'Name',
    status: 'Status',
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
    state: 'TX',
    url: socrata('data.texas.gov', '9cir-efmm'),
    entityNumber: 'Secretary of State (SOS) or COA File Number',
    name: 'Taxpayer Name',
    status: 'SOS Status Code',
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
    formationDate: { field: 'effective_date', format: 'ymd' },
    registeredAgent: ['registered_agent'],
    address: {
      line1: 'ho_address_1',
      city: 'ho_city',
      state: 'ho_state',
      zip: 'ho_zip',
    },
    officers: [],
  },
  {
    state: 'DC',
    url: 'https://opendata.dc.gov/api/download/v1/items/5238c4fd99c843a1bd7679a243747a8c/csv?layers=0',
    entityNumber: 'FILE_NUMBER',
    name: 'BUSINESS_NAME',
    status: 'ENTITY_STATUS',
    formationDate: { field: 'EFFECTIVE_DATE', format: 'ymd' },
    registeredAgent: ['RA_NAME'],
    address: {
      line1: 'BUSNIESS_ADDRESS_LINE1',
      city: 'BUSINESS_CITY',
      state: 'BUSINESS_STATE',
      zip: 'ZIPCODE',
    },
    officers: [],
  },
];

function joined(reader: RecordReader, names: string[]): string | null {
  const parts = names.flatMap((name) => reader.text(name) ?? []);
  return parts.length === 0 ? null : parts.join(' ');
}

function formationDate(
  reader: RecordReader,
  date: RegistryAdapter['formationDate'],
): string | null {
  if (!date) return null;
  return date.format === 'mdy'
    ? reader.usDate(date.field)
    : reader.isoDate(date.field);
}

export function parseRegistry(adapter: RegistryAdapter) {
  return (reader: RecordReader): RegistryEntry => ({
    entity: {
      state: adapter.state,
      entity_number: reader.required(adapter.entityNumber),
      name: reader.required(adapter.name),
      status: adapter.status ? reader.text(adapter.status) : null,
      formation_date: formationDate(reader, adapter.formationDate),
      registered_agent: adapter.registeredAgent
        ? joined(reader, adapter.registeredAgent)
        : null,
      mailing_address_line1: adapter.address
        ? reader.text(adapter.address.line1)
        : null,
      mailing_city: adapter.address ? reader.text(adapter.address.city) : null,
      mailing_state: adapter.address
        ? reader.text(adapter.address.state)
        : null,
      mailing_postal_code: adapter.address
        ? reader.text(adapter.address.zip)
        : null,
    },
    officers: adapter.officers.flatMap(({ name, title }) => {
      const officer = joined(reader, name);
      if (officer === null) return [];
      return [
        {
          name: officer,
          title: 'text' in title ? title.text : reader.text(title.field),
        },
      ];
    }),
  });
}

export function registryColumns(adapter: RegistryAdapter): string[] {
  return [
    adapter.entityNumber,
    adapter.name,
    ...(adapter.status ? [adapter.status] : []),
    ...(adapter.formationDate ? [adapter.formationDate.field] : []),
    ...(adapter.registeredAgent ?? []),
    ...(adapter.address ? Object.values(adapter.address) : []),
    ...adapter.officers.flatMap(({ name, title }) =>
      'field' in title ? [...name, title.field] : name,
    ),
  ];
}

export function registryAdapter(state: string): RegistryAdapter {
  return REGISTRY_ADAPTERS.find((adapter) => adapter.state === state)!;
}

export function registryFiles(): Extract<
  LeadFileRef,
  { kind: 'state_registry' }
>[] {
  return REGISTRY_ADAPTERS.map(({ state, url }) => ({
    kind: 'state_registry',
    state,
    url,
  }));
}
