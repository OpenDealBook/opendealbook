import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

type Area = 'messages' | 'seller_room';

export async function recordCounselVisit(
  client: SupabaseClient<Database>,
  dealId: string,
  area: Area,
): Promise<void> {
  await client
    .from('counsel_visit')
    .upsert(
      { deal_id: dealId, area, visited_at: new Date().toISOString() },
      { onConflict: 'user_id,deal_id,area' },
    )
    .throwOnError();
}

export async function lastCounselVisits(
  client: SupabaseClient<Database>,
  area: Area,
): Promise<Map<string, string>> {
  const { data } = await client
    .from('counsel_visit')
    .select('deal_id, visited_at')
    .eq('area', area)
    .throwOnError();

  return new Map(data.map((visit) => [visit.deal_id, visit.visited_at]));
}
