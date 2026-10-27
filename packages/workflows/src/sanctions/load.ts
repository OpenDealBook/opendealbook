import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { parseCsl } from './csl';

const BATCH_SIZE = 1000;

export async function loadScreeningList(
  importId: string,
  json: string,
  heartbeat: () => void,
): Promise<void> {
  const client = getSupabaseServerAdminClient();
  const { asOf, entries } = parseCsl(json);
  for (let start = 0; start < entries.length; start += BATCH_SIZE) {
    await client
      .from('screening_entry')
      .upsert(
        entries
          .slice(start, start + BATCH_SIZE)
          .map((entry) => ({ ...entry, import_id: importId })),
        { onConflict: 'import_id,list_name,source_entry_id' },
      )
      .throwOnError();
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
