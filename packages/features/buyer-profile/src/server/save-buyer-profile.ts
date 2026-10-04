import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

import { loadBuyerProfile } from './load-buyer-profile';

type Client = SupabaseClient<Database>;

export type BuyerProfileDraft = {
  display_name: string | null;
  headline: string | null;
  about: string | null;
  experience: string | null;
  motivation: string | null;
  target_statement: string | null;
  value_proposition: string | null;
};

export async function saveBuyerProfile(
  client: Client,
  accountId: string,
  draft: BuyerProfileDraft,
): Promise<void> {
  const current = await loadBuyerProfile(client, accountId);
  const version = current ? current.version + 1 : 1;

  const { error } = await client
    .from('buyer_profile')
    .insert({ account_id: accountId, version, ...draft });

  if (error) {
    throw error;
  }
}
