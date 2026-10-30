import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

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
    throw Object.assign(
      new Error('Not permitted to manage deals: needs deals.manage'),
      { code: '42501' },
    );
  }
}
