import { Refusal } from '@odb/lender-rooms/actions/refusal.ts';
import { refuseWhileTeamLocked } from '@odb/lender-rooms/actions/team-lock.ts';
import { getSupabaseServerClient } from '@odb/supabase/server';

export async function refuseUnlessDealTeam(accountId: string, userId: string) {
  const { data: mayManage } = await getSupabaseServerClient()
    .rpc('has_permission', {
      account_id: accountId,
      permission_name: 'deals.manage',
      user_id: userId,
    })
    .throwOnError();

  if (!mayManage) {
    throw new Refusal('Only the deal team can do that');
  }

  await refuseWhileTeamLocked(accountId);
}
