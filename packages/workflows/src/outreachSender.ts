import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

export async function outreachSender(accountId: string): Promise<{ name: string; company: string }> {
  const admin = getSupabaseServerAdminClient();
  const [{ data: team }, { data: profile }] = await Promise.all([
    admin.from('accounts').select('name, primary_owner_user_id').eq('id', accountId).single().throwOnError(),
    admin
      .from('buyer_profile')
      .select('display_name')
      .eq('account_id', accountId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()
      .throwOnError(),
  ]);
  if (profile?.display_name) {
    return { name: profile.display_name, company: team.name };
  }
  const { data: owner } = await admin
    .from('accounts')
    .select('name')
    .eq('primary_owner_user_id', team.primary_owner_user_id)
    .eq('is_personal_account', true)
    .single()
    .throwOnError();
  return { name: owner.name, company: team.name };
}
