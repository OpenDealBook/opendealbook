import type { SupabaseClient } from '@supabase/supabase-js';

import { Refusal } from '@odb/lender-rooms/actions/refusal.ts';
import { TEAM_READ_ONLY } from '@odb/next';
import type { Database } from '@odb/supabase';

export async function ensureManagedRoom(
  client: SupabaseClient<Database>,
  dealId: string,
  notAllowed: string,
): Promise<string> {
  const { data: deal } = await client
    .from('deal')
    .select('account_id')
    .eq('id', dealId)
    .maybeSingle()
    .throwOnError();

  if (!deal) {
    throw new Refusal(notAllowed);
  }

  const { data: locked } = await client
    .rpc('is_account_locked', { target_account_id: deal.account_id })
    .throwOnError();

  if (locked) {
    throw new Refusal(TEAM_READ_ONLY);
  }

  const { data: roomId, error } = await client.rpc('ensure_seller_room', {
    deal_id: dealId,
  });

  if (error?.code === '42501') {
    throw new Refusal(notAllowed);
  }

  if (error) {
    throw error;
  }

  return roomId;
}
