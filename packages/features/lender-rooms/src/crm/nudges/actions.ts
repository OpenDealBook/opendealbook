'use server';

import { getSupabaseServerClient } from '@odb/supabase/server';

import { refusableAction } from '../../actions/refusable-action';
import { Refusal } from '../../actions/refusal';
import { refuseWhileTeamLocked } from '../../actions/team-lock';
import { setQuietDaysInput } from './schema';

export const setQuietDays = refusableAction(
  async (input, user) => {
    const client = getSupabaseServerClient();

    const { data: mayManage } = await client
      .rpc('has_permission', {
        account_id: input.accountId,
        permission_name: 'deals.manage',
        user_id: user.id,
      })
      .throwOnError();

    if (!mayManage) {
      throw new Refusal('Only the deal team can do that');
    }

    await refuseWhileTeamLocked(input.accountId);

    await client
      .from('lender_nudge_setting')
      .upsert({ account_id: input.accountId, quiet_days: input.quietDays })
      .throwOnError();
  },
  { auth: true, schema: setQuietDaysInput },
);
