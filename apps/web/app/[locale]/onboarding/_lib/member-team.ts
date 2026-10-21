import type { getSupabaseServerClient } from '@odb/supabase/server';

export async function findMemberTeam(
  client: ReturnType<typeof getSupabaseServerClient>,
  slug: string,
) {
  const { data } = await client
    .from('accounts')
    .select('id, slug')
    .eq('slug', slug)
    .eq('is_personal_account', false)
    .maybeSingle()
    .throwOnError();

  return data;
}

export async function findJoinedTeamsNotOwned(
  client: ReturnType<typeof getSupabaseServerClient>,
  userId: string,
) {
  const { data } = await client
    .from('accounts')
    .select('slug, accounts_memberships!inner(user_id)')
    .eq('accounts_memberships.user_id', userId)
    .eq('is_personal_account', false)
    .neq('primary_owner_user_id', userId)
    .throwOnError();

  return data;
}
