import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { csvRecords } from './csv';
import type { LeadFile } from './files';
import { RecordReader, RejectedRow } from './recordReader';
import {
  type Form5500Filing,
  type PppLoan,
  type SbaLoan,
  FORM_5500_COLUMNS,
  FORM_5500_SF_COLUMNS,
  PPP_COLUMNS,
  SBA_COLUMNS,
  parseForm5500,
  parseForm5500Sf,
  parsePpp,
  parseSba,
} from './sources';
import {
  type RegistryEntry,
  parseRegistry,
  registryAdapter,
  registryColumns,
} from './stateRegistries';

import type { Readable } from 'node:stream';

const BATCH_SIZE = 1000;

type Client = ReturnType<typeof getSupabaseServerAdminClient>;

interface SourceSpec<T> {
  columns: string[];
  parse: (reader: RecordReader) => T;
  key: (row: T) => string;
  merge?: (earlier: T, later: T) => T;
  write: (client: Client, importId: string, rows: T[]) => PromiseLike<unknown>;
}

function upserting<T>(
  columns: string[],
  parse: (reader: RecordReader) => T,
  key: (row: T) => string,
  upsert: (
    client: Client,
    rows: (T & { import_id: string })[],
  ) => PromiseLike<unknown>,
): SourceSpec<T> {
  return {
    columns,
    parse,
    key,
    write: (client, importId, rows) =>
      upsert(
        client,
        rows.map((row) => ({ ...row, import_id: importId })),
      ),
  };
}

const ppp = upserting<PppLoan>(
  PPP_COLUMNS,
  parsePpp,
  (row) => row.loan_number,
  (client, rows) =>
    client
      .from('ppp_loan')
      .upsert(rows, { onConflict: 'loan_number' })
      .throwOnError(),
);

const sba = (program: SbaLoan['program']) =>
  upserting<SbaLoan>(
    SBA_COLUMNS,
    parseSba(program),
    (row) => row.source_key,
    (client, rows) =>
      client
        .from('sba_loan')
        .upsert(rows, { onConflict: 'source_key' })
        .throwOnError(),
  );

const form5500 = (
  columns: string[],
  parse: (reader: RecordReader) => Form5500Filing,
) =>
  upserting<Form5500Filing>(
    columns,
    parse,
    (row) => row.ack_id,
    (client, rows) =>
      client
        .from('form_5500_filing')
        .upsert(rows, { onConflict: 'ack_id' })
        .throwOnError(),
  );

const registry = (state: string, asOf: string): SourceSpec<RegistryEntry> => ({
  columns: registryColumns(registryAdapter(state)),
  parse: parseRegistry(registryAdapter(state)),
  key: (row) => row.entity.entity_number,
  merge: (earlier, later) => ({
    ...later,
    officers: [...earlier.officers, ...later.officers],
  }),
  write: async (client, importId, rows) => {
    const { data: entities } = await client
      .from('state_registry_entity')
      .upsert(
        rows.map(({ entity }) => ({
          ...entity,
          import_id: importId,
          source: 'bulk_file' as const,
          fetched_at: asOf,
        })),
        { onConflict: 'state,entity_number' },
      )
      .select('id, entity_number')
      .throwOnError();
    const entityIds = new Map(
      entities.map((entity) => [entity.entity_number, entity.id]),
    );
    const entityId = (entityNumber: string) => {
      const id = entityIds.get(entityNumber);
      if (id === undefined) {
        throw new Error(
          `registry upsert returned no id for entity ${entityNumber}`,
        );
      }
      return id;
    };
    const officers = rows.flatMap(({ entity, officers }) => {
      const id = entityId(entity.entity_number);
      return officers.map((officer) => ({ ...officer, entity_id: id }));
    });
    if (officers.length > 0) {
      await client
        .from('state_registry_officer')
        .upsert(officers, {
          onConflict: 'entity_id,name,title',
          ignoreDuplicates: true,
        })
        .throwOnError();
    }
  },
});

export function loadLeadFile(
  importId: string,
  file: LeadFile,
  csv: Readable,
  heartbeat: () => void,
): Promise<void> {
  switch (file.kind) {
    case 'ppp':
      return loadRows(importId, csv, heartbeat, ppp);
    case 'sba_7a':
    case 'sba_504':
      return loadRows(importId, csv, heartbeat, sba(file.kind));
    case 'form_5500':
      return loadRows(
        importId,
        csv,
        heartbeat,
        form5500(FORM_5500_COLUMNS, parseForm5500),
      );
    case 'form_5500_sf':
      return loadRows(
        importId,
        csv,
        heartbeat,
        form5500(FORM_5500_SF_COLUMNS, parseForm5500Sf),
      );
    case 'state_registry':
      return loadRows(
        importId,
        csv,
        heartbeat,
        registry(file.state, file.asOf),
      );
  }
}

async function loadRows<T>(
  importId: string,
  csv: Readable,
  heartbeat: () => void,
  spec: SourceSpec<T>,
): Promise<void> {
  const client = getSupabaseServerAdminClient();
  const counts = {
    rows_read: 0,
    rows_written: 0,
    rows_rejected: 0,
    rows_with_nulled_fields: 0,
  };
  let batch = new Map<string, T>();

  const flush = async () => {
    await spec.write(client, importId, [...batch.values()]);
    counts.rows_written += batch.size;
    heartbeat();
    batch = new Map();
  };

  for await (const record of csvRecords(csv, spec.columns)) {
    counts.rows_read += 1;
    try {
      const reader = new RecordReader(record);
      const row = spec.parse(reader);
      if (reader.nulled.length > 0) counts.rows_with_nulled_fields += 1;
      const key = spec.key(row);
      const earlier = batch.get(key);
      batch.set(key, earlier && spec.merge ? spec.merge(earlier, row) : row);
    } catch (error) {
      if (!(error instanceof RejectedRow)) throw error;
      counts.rows_rejected += 1;
    }
    if (batch.size === BATCH_SIZE) await flush();
  }
  if (batch.size > 0) await flush();

  await client
    .from('lead_import')
    .update({ ...counts, status: 'succeeded' })
    .eq('id', importId)
    .throwOnError();
}
