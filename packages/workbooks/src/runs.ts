import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Tables, TablesInsert } from '@tuckin/supabase';

export interface RecordWorkbookRunInput {
  workbookId: string;
  accountId: string;
  startedAt: string;
  finishedAt: string | null;
  itemsTotal: number;
  itemsDone: number;
  status: string;
  exceptions?: TablesInsert<'workbook_run'>['exceptions'];
}

export async function recordWorkbookRun(
  input: RecordWorkbookRunInput,
  client: SupabaseClient<Database>,
): Promise<Tables<'workbook_run'>> {
  const { data, error } = await client
    .from('workbook_run')
    .insert({
      workbook_id: input.workbookId,
      account_id: input.accountId,
      started_at: input.startedAt,
      finished_at: input.finishedAt,
      items_total: input.itemsTotal,
      items_done: input.itemsDone,
      status: input.status,
      exceptions: input.exceptions ?? null,
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
}
