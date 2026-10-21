import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

export async function shouldAskLenderName(
  client: SupabaseClient<Database>,
): Promise<boolean> {
  const {
    data: { user },
  } = await client.auth.getUser();

  const { data: person } = await client
    .from('lender_person')
    .select('name, name_asked_at')
    .eq('user_id', user!.id)
    .maybeSingle()
    .throwOnError();

  return !person || (person.name === null && person.name_asked_at === null);
}

export async function shouldAskLenderPhone(
  client: SupabaseClient<Database>,
): Promise<boolean> {
  if (await shouldAskLenderName(client)) {
    return false;
  }

  const {
    data: { user },
  } = await client.auth.getUser();

  const { data: account } = await client
    .from('accounts')
    .select('phone_asked_at')
    .eq('id', user!.id)
    .single()
    .throwOnError();

  return account.phone_asked_at === null;
}

export async function lenderNames(
  client: SupabaseClient<Database>,
  userIds: string[],
): Promise<Map<string, string | null>> {
  const { data: people } = await client
    .from('lender_person')
    .select('user_id, name')
    .in('user_id', userIds)
    .throwOnError();

  return new Map(people.map((person) => [person.user_id, person.name]));
}
