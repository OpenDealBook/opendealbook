import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

export type LenderHistoryRow =
  Database['public']['Functions']['lender_history']['Returns'][number];

export async function listLenderHistory(
  client: SupabaseClient<Database>,
  lenderId: string,
): Promise<LenderHistoryRow[]> {
  const { data } = await client
    .rpc('lender_history', { lender_id: lenderId })
    .throwOnError();

  return data;
}
