import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { z } from 'zod';

import { parseCsl } from './csl';
import { SCREENED_ENTRY, screeningNames } from './match';

const BATCH_SIZE = 1000;

const NAMED_ENTRY = SCREENED_ENTRY.pick({ name: true, alt_names: true, entry_type: true }).extend({
  id: z.number(),
});

const NAMED_COLUMNS = 'id, name, alt_names, entry_type';

async function storeNames(entries: z.infer<typeof NAMED_ENTRY>[]): Promise<void> {
  await getSupabaseServerAdminClient()
    .from('screening_name')
    .upsert(
      entries.flatMap((entry) =>
        screeningNames(entry).map((name) => ({ ...name, entry_id: entry.id })),
      ),
      { onConflict: 'entry_id,variant,key', ignoreDuplicates: true },
    )
    .throwOnError();
}

export async function indexScreeningNames(): Promise<void> {
  const client = getSupabaseServerAdminClient();
  for (let from = 0; ; from += BATCH_SIZE) {
    const { data } = await client
      .from('screening_entry_current')
      .select(NAMED_COLUMNS)
      .order('id')
      .range(from, from + BATCH_SIZE - 1)
      .throwOnError();
    await storeNames(NAMED_ENTRY.array().parse(data));
    if (data.length < BATCH_SIZE) {
      return;
    }
  }
}

export async function loadScreeningList(
  importId: string,
  json: string,
  heartbeat: () => void,
): Promise<void> {
  const client = getSupabaseServerAdminClient();
  const { asOf, entries } = parseCsl(json);
  for (let start = 0; start < entries.length; start += BATCH_SIZE) {
    const { data: stored } = await client
      .from('screening_entry')
      .upsert(
        entries
          .slice(start, start + BATCH_SIZE)
          .map((entry) => ({ ...entry, import_id: importId })),
        { onConflict: 'import_id,list_name,source_entry_id' },
      )
      .select(NAMED_COLUMNS)
      .throwOnError();
    await storeNames(stored);
    heartbeat();
  }
  const { data: loaded } = await client
    .from('screening_import')
    .update({ status: 'succeeded', as_of: asOf, entry_count: entries.length })
    .eq('id', importId)
    .select('created_at')
    .single()
    .throwOnError();
  const { data: older } = await client
    .from('screening_import')
    .select('id')
    .lt('created_at', loaded.created_at)
    .throwOnError();
  await client
    .from('screening_entry')
    .delete()
    .in(
      'import_id',
      older.map((superseded) => superseded.id),
    )
    .throwOnError();
}
