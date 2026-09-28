import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

export async function getSuperAdminState(
  client: SupabaseClient<Database>,
): Promise<{ hasRole: boolean; isSuperAdmin: boolean }> {
  const { data } = await client.rpc('super_admin_state').single();

  return { hasRole: data!.has_role, isSuperAdmin: data!.is_super_admin };
}

export async function isSuperAdmin(
  client: SupabaseClient<Database>,
): Promise<boolean> {
  const { data } = await client.rpc('is_super_admin');

  return data!;
}

export async function hasSuperAdminRole(
  client: SupabaseClient<Database>,
): Promise<boolean> {
  const { data } = await client.rpc('has_super_admin_role');

  return data!;
}

export async function assertSuperAdmin(
  client: SupabaseClient<Database>,
): Promise<void> {
  if (!(await isSuperAdmin(client))) {
    throw new Error('Super admin access required');
  }
}
