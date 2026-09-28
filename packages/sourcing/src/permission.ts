import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Enums } from '@odb/supabase';

async function assertPermission(
  client: SupabaseClient<Database>,
  accountId: string,
  userId: string,
  permission: Enums<'app_permissions'>,
): Promise<void> {
  const { data } = await client.rpc('has_permission', {
    account_id: accountId,
    user_id: userId,
    permission_name: permission,
  });

  if (data !== true) {
    throw new Error(`${permission} permission required`);
  }
}

export async function assertDealsManage(
  client: SupabaseClient<Database>,
  accountId: string,
  userId: string,
): Promise<void> {
  await assertPermission(client, accountId, userId, 'deals.manage');
}

export async function assertDealsCreate(
  client: SupabaseClient<Database>,
  accountId: string,
  userId: string,
): Promise<void> {
  await assertPermission(client, accountId, userId, 'deals.create');
}
