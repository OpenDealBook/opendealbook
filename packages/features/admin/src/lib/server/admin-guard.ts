import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@tuckin/supabase';

import { getSuperAdminState } from './utils/super-admin';

export type AdminGuardResult = { status: 'ok' | 'needs-mfa' | 'forbidden' };

export async function adminGuard(
  client: SupabaseClient<Database>,
): Promise<AdminGuardResult> {
  const { hasRole, isSuperAdmin } = await getSuperAdminState(client);

  if (!hasRole) {
    return { status: 'forbidden' };
  }

  if (!isSuperAdmin) {
    return { status: 'needs-mfa' };
  }

  return { status: 'ok' };
}
