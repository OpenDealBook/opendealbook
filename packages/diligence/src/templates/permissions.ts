import { TEAM_READ_ONLY } from '@odb/next';
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

export const DEAL_TEAM_ONLY = 'Only the deal team can do that';

export async function checklistsRefusal(
  client: ServerClient,
  accountId: string,
  userId: string,
): Promise<string | null> {
  const { data: manages } = await client
    .rpc('has_permission', {
      account_id: accountId,
      permission_name: 'deals.manage',
      user_id: userId,
    })
    .throwOnError();

  if (manages !== true) {
    return DEAL_TEAM_ONLY;
  }

  const { data: locked } = await client
    .rpc('is_account_locked', { target_account_id: accountId })
    .throwOnError();

  return locked ? TEAM_READ_ONLY : null;
}
