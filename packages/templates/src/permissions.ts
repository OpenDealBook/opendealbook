import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@tuckin/supabase';

export async function assertDealsManager(
  client: SupabaseClient<Database>,
  accountId: string,
  userId: string,
): Promise<void> {
  const { data: allowed, error } = await client.rpc('has_permission', {
    account_id: accountId,
    permission_name: 'deals.manage',
    user_id: userId,
  });

  if (error) {
    throw error;
  }

  if (!allowed) {
    throw new Error('Not permitted to manage deals');
  }
}
