import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

type Client = SupabaseClient<Database>;

export async function assertDealPermission(
  client: Client,
  dealId: string,
  permission = 'deals.manage',
): Promise<void> {
  const { data } = await client.rpc('has_deal_permission', {
    deal_id: dealId,
    permission,
  });

  if (data !== true) {
    throw Object.assign(
      new Error(`not authorized on deal ${dealId}: needs ${permission}`),
      { code: '42501' },
    );
  }
}

export async function resolveDealAccountId(
  client: Client,
  dealId: string,
): Promise<string> {
  const { data, error } = await client
    .from('deal')
    .select('account_id')
    .eq('id', dealId)
    .single();

  if (error) {
    throw error;
  }

  return data.account_id;
}
