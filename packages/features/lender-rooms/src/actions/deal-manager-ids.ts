import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

export async function dealManagerIds(
  admin: SupabaseClient<Database>,
  accountId: string,
) {
  const [{ data: members }, { data: managerRoles }] = await Promise.all([
    admin
      .from('accounts_memberships')
      .select('user_id, account_role')
      .eq('account_id', accountId)
      .throwOnError(),
    admin
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