import { getSupabaseServerClient } from '@odb/supabase/server';

type ServerClient = ReturnType<typeof getSupabaseServerClient>;

export async function assertChecklistsManager(
  client: ServerClient,
  accountId: string,
  userId: string,
): Promise<void> {
  const { data } = await client.rpc('has_permission', {
    account_id: accountId,
    permission_name: 'checklists.manage',
    user_id: userId,
  });

  if (data !== true) {
    throw new Error('checklists.manage permission required');
  }
}

export async function assertDealChecklistsManager(
  client: ServerClient,
  dealId: string,
): Promise<void> {
  const { data } = await client.rpc('has_deal_permission', {
    deal_id: dealId,
    permission: 'checklists.manage',
  });

  if (data !== true) {
    throw new Error('checklists.manage permission required');
  }
}
