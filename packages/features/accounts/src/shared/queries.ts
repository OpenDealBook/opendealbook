import type { Tables } from '@tuckin/supabase';
import type { getSupabaseBrowserClient } from '@tuckin/supabase/client';

type Client = ReturnType<typeof getSupabaseBrowserClient>;

export type PersonalAccountData = Pick<
  Tables<'accounts'>,
  'id' | 'name' | 'email' | 'picture_url' | 'public_data'
>;

export async function fetchPersonalAccount(
  client: Client,
  userId: string,
): Promise<PersonalAccountData> {
  const { data, error } = await client
    .from('accounts')
    .select('id, name, email, picture_url, public_data')
    .eq('primary_owner_user_id', userId)
    .eq('is_personal_account', true)
    .single();

  if (error) {
    throw error;
  }

  return data;
}
