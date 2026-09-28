import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

type Row = Record<string, unknown>;

interface StoredUpload {
  path: string;
  bytes: Uint8Array;
  contentType: string | undefined;
}

export interface MemoryClient {
  client: SupabaseClient<Database>;
  tables: Record<string, Row[]>;
  uploads: StoredUpload[];
}

export interface MemoryClientOptions {
  seed?: Record<string, Row[]>;
  failDocumentInsert?: (row: Row) => boolean;
}

export function createMemoryClient(
  options: MemoryClientOptions = {},
): MemoryClient {
  const tables: Record<string, Row[]> = {
    upload_batch: [],
    upload_item: [],
    dr_document: [],
    ...options.seed,
  };
  const uploads: StoredUpload[] = [];
  let sequence = 0;

  function from(table: string) {
    const rows = (tables[table] ??= []);
    const filters: Array<[string, unknown]> = [];
    let insertPayload: Row | Row[] | null = null;
    let updatePayload: Row | null = null;

    const matches = (row: Row) =>
      filters.every(([column, value]) => row[column] === value);

    function run(single: boolean) {
      if (insertPayload) {
        const payloads = Array.isArray(insertPayload)
          ? insertPayload
          : [insertPayload];
        const created: Row[] = [];

        for (const payload of payloads) {
          if (table === 'dr_document' && options.failDocumentInsert?.(payload)) {
            return { data: null, error: new Error('document insert rejected') };
          }

          const row: Row = { id: `${table}-${++sequence}`, ...payload };
          rows.push(row);
          created.push(row);
        }

        return { data: single ? (created[0] ?? null) : created, error: null };
      }

      if (updatePayload) {
        const updated = rows.filter(matches);

        for (const row of updated) {
          Object.assign(row, updatePayload);
        }

        return { data: single ? (updated[0] ?? null) : updated, error: null };
      }

      const found = rows.filter(matches);

      return { data: single ? (found[0] ?? null) : found, error: null };
    }

    const builder = {
      select() {
        return builder;
      },
      order() {
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.push([column, value]);
        return builder;
      },
      insert(payload: Row | Row[]) {
        insertPayload = payload;
        return builder;
      },
      update(payload: Row) {
        updatePayload = payload;
        return builder;
      },
      single() {
        return Promise.resolve(run(true));
      },
      then<T>(
        onFulfilled: (value: ReturnType<typeof run>) => T,
      ): Promise<T> {
        return Promise.resolve(run(false)).then(onFulfilled);
      },
    };

    return builder;
  }

  const storage = {
    from() {
      return {
        upload(
          path: string,
          bytes: Uint8Array,
          uploadOptions?: { contentType?: string },
        ) {
          uploads.push({ path, bytes, contentType: uploadOptions?.contentType });
          return Promise.resolve({ data: { path }, error: null });
        },
      };
    },
  };

  return {
    client: { from, storage } as unknown as SupabaseClient<Database>,
    tables,
    uploads,
  };
}
