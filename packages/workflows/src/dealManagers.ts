import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

export async function dealManagerIds(accountId: string): Promise<string[]> {
  const client = getSupabaseServerAdminClient();
  const [{ data: members }, { data: managerRoles }] = await Promise.all([
    client
      .from('accounts_memberships')
      .select('user_id, account_role')
      .eq('account_id', accountId)
      .throwOnError(),
    client
      .from('role_permissions')
      .select('role')
      .eq('permission', 'deals.manage')
      .throwOnError(),
  ]);
  const roles = new Set(managerRoles.map((row) => row.role));

  return members
    .filter((member) => roles.has(member.account_role))
    .map((member) => member.user_id);
}