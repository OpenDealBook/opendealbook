import { notFound } from 'next/navigation';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

export async function loadWindowDeal(
  client: SupabaseClient<Database>,
  teamId: string,
  dealId: string,
) {
  const { data } = await client
    .from('deal')
    .select('firm!inner(name)')
    .eq('id', dealId)
    .eq('account_id', teamId)
    .maybeSingle()
    .throwOnError();

  if (!data) {
    notFound();
  }

  return data;
}
