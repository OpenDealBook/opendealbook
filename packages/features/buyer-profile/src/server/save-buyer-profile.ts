import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

import { loadBuyerProfile } from './load-buyer-profile';

type Client = SupabaseClient<Database>;

export type BuyerProfileExpertise = { areas: string[] };

export type BuyerProfileFinancing = {
  cash_available: string;
  max_purchase_price: string;
  sba_prequalified: boolean;
};

export type BuyerProfileContact = {
  email: string;
  phone: string;
  website: string;
};

export type BuyerProfileSensitive = {
  credit_score: string;
  pre_approval: string;
  phone: string;
};

export type BuyerProfileDraft = {
  display_name: string | null;
  headline: string | null;
  about: string | null;
  experience: string | null;
  motivation: string | null;
  target_statement: string | null;
  value_proposition: string | null;
  expertise_json: BuyerProfileExpertise | null;
  financing_json: BuyerProfileFinancing | null;
  contact_json: BuyerProfileContact | null;
  interested_json: string[] | null;
  not_interested_json: string[] | null;
  photo_path: string | null;
  include_sensitive: boolean;
  sensitive_json: BuyerProfileSensitive | null;
};

export async function saveBuyerProfile(
  client: Client,
  accountId: string,
  draft: BuyerProfileDraft,
): Promise<void> {
  const current = await loadBuyerProfile(client, accountId);
  const version = current ? current.version + 1 : 1;

  const { error } = await client.from('buyer_profile').insert({
    account_id: accountId,
    version,
    ...draft,
    sensitive_json: draft.include_sensitive ? draft.sensitive_json : null,
  });

  if (error) {
    throw error;
  }
}
