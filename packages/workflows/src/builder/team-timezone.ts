import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

export async function teamTimezone(accountId: string): Promise<string> {
  const { data: team } = await getSupabaseServerAdminClient()
    .from('accounts')
    .select('timezone')
    .eq('id', accountId)
    .single()
    .throwOnError();
  return team.timezone ?? 'UTC';
}
