import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

import type { BuyerProfile } from './render-buyer-profile-html';

type Client = SupabaseClient<Database>;

export async function loadBuyerProfile(
  client: Client,
  accountId: string,
): Promise<BuyerProfile | null> {
  const { data, error } = await client
    .rpc('current_buyer_profile', { account_id: accountId })
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}
