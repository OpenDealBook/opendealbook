import 'server-only';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { areUuids } from './lender-page-params';

export async function managesDeal(
  dealId: string,
  accountId: string,
): Promise<boolean> {
  if (!areUuids(dealId)) {
    return false;
  }

  const { data: manages } = await getSupabaseServerClient()
    .rpc('manages_deal_in_account', { deal_id: dealId, account_id: accountId })
    .throwOnError();

  return manages;
}
