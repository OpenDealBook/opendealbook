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
  type DetailAdapter,
  type EntityAdapter,
  type RegistryDetail,
  type RegistryEntry,
  parseRegistry,
  parseRegistryDetail,
  registryAdapter,
  registryColumns,
  suppliedFields,
} from './stateRegistries';

import type { Readable } from 'node:stream';

const BATCH_SIZE = 1000;

type Client = ReturnType<typeof getSupabaseServerAdminClient>;

interface SourceSpec<T> {
  columns: string[];
  parse: (reader: RecordReader) => T | null;
  key: (row: T) => string;
  merge?: (earlier: T, later: T) => T;
  write: (client: Client, importId: string, rows: T[]) => Promise<number>;
  finish?: (
    client: Client,
    importId: string,
    rowsRead: number,
  ) => PromiseLike<unknown>;
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
    write: async (client, importId, rows) => {
      await upsert(
        client,
        rows.map((row) => ({ ...row, import_id: importId })),
      );
      return 0;
    },
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

function coalesced<T extends object>(earlier: T, later: T): T {
  return {
    ...earlier,
    ...Object.fromEntries(
      Object.entries(later).filter(([, value]) => value !== null),
    ),
  };
}

const registryEntities = (
  adapter: EntityAdapter,
  asOf: string,
): SourceSpec<RegistryEntry> => ({
  columns: registryColumns(adapter),
  parse: parseRegistry(adapter),
  key: (row) => row.entity.entity_number,
  merge: (earlier, later) => ({
    entity: coalesced(earlier.entity, later.entity),
    officers: [...earlier.officers, ...later.officers],
  }),
  write: async (client, importId, rows) => {
    const { data: entities } = await client
      .rpc('upsert_state_registry_entities', {
        p_rows: rows.map(({ entity }) => ({
          ...entity,
          import_id: importId,
          source: 'bulk_file',
          fetched_at: asOf,
        })),
        p_supplied: suppliedFields(adapter),
      })
      .throwOnError();
    const entityIds = new Map(
      entities.map((entity) => [entity.entity_number, entity.id]),
    );
    const officers = rows.flatMap(({ entity, officers }) => {
      const id = entityIds.get(entity.entity_number);
      return id === undefined
        ? []
        : officers.map((officer) => ({ ...officer, entity_id: id }));
    });
    if (adapter.officers.length > 0) {
      await client
        .rpc('replace_state_registry_officers', {
          p_dataset: adapter.dataset,
          p_import_id: importId,
          p_entity_ids: [...entityIds.values()],
          p_officers: officers,
        })
        .throwOnError();
    }
    return rows.length - entities.length;
  },
  finish: adapter.activeOnly
    ? async (client, importId, rowsRead) => {
        const { data: marked } = await client
          .rpc('mark_unlisted_state_registry_entities', {
            p_state: adapter.state,
            p_import_id: importId,
            p_rows_read: rowsRead,
          })
          .throwOnError();
        if (!marked) {
          console.warn(
            `[leadImports] skipped marking ${adapter.state} drop-outs for import ${importId}: no earlier import of ${adapter.dataset}, or ${rowsRead} rows is under 80% of the last one`,
          );
        }
      }
    : undefined,
});

const registryDetails = (
  adapter: DetailAdapter,
): SourceSpec<RegistryDetail> => {
  let unmatched = 0;
  return {
    columns: registryColumns(adapter),
    parse: parseRegistryDetail(adapter),
    key: (row) => row.source_id,
    merge: (earlier, later) => ({
      source_id: later.source_id,
      registered_agent: later.registered_agent ?? earlier.registered_agent,
      officers: [...earlier.officers, ...later.officers],
      rows: earlier.rows + later.rows,
    }),
    write: async (client, importId, rows) => {
      const { data } = await client
        .rpc('attach_state_registry_details', {
          p_state: adapter.state,
          p_dataset: adapter.dataset,
          p_import_id: importId,
          p_rows: rows,
        })
        .throwOnError();
      unmatched += data;
      return 0;
    },
    finish: async (client, importId) => {
      await client
        .from('lead_import')
        .update({ rows_unmatched: unmatched })
        .eq('id', importId)
        .throwOnError();
      if (unmatched > 0) {
        console.warn(
          `[leadImports] ${unmatched} ${adapter.dataset} rows matched no entity in import ${importId}`,
        );
      }
    },
  };
};

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
    case 'state_registry': {
      const adapter = registryAdapter(file.dataset);
      return 'attach' in adapter
        ? loadRows(importId, csv, heartbeat, registryDetails(adapter))
        : loadRows(
            importId,
            csv,
            heartbeat,
            registryEntities(adapter, file.asOf),
          );
    }
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
    const refused = await spec.write(client, importId, [...batch.values()]);
    counts.rows_written += batch.size - refused;
    counts.rows_rejected += refused;
    heartbeat();
    batch = new Map();
  };

  for await (const record of csvRecords(csv, spec.columns)) {
    counts.rows_read += 1;
    try {
      const reader = new RecordReader(record);
      const row = spec.parse(reader);
      if (reader.nulled.length > 0) counts.rows_with_nulled_fields += 1;
      if (row !== null) {
        const key = spec.key(row);
        const earlier = batch.get(key);
        batch.set(key, earlier && spec.merge ? spec.merge(earlier, row) : row);
      }
    } catch (error) {
      if (!(error instanceof RejectedRow)) throw error;
      counts.rows_rejected += 1;
    }
    if (batch.size === BATCH_SIZE) await flush();
  }
  if (batch.size > 0) await flush();
  await spec.finish?.(client, importId, counts.rows_read);

  await client
    .from('lead_import')
    .update({ ...counts, status: 'succeeded' })
    .eq('id', importId)
    .throwOnError();
}
