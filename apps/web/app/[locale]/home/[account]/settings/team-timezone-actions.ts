'use server';

import { z } from 'zod';

import { refusableAction } from '@odb/next/actions/refusable-action';
import { Refusal } from '@odb/next/refusal';
import { getSupabaseServerClient } from '@odb/supabase/server';
import {
  SchedulesPartlyUpdated,
  syncTeamSchedules,
} from '@odb/workflows/builder/schedule';

const NEEDS_SETTINGS_MANAGE = 'Changing the time zone needs settings.manage';
const CHECK_VIOLATION = '23514';

async function moveSchedules(accountId: string) {
  return syncTeamSchedules({ accountId }).then(
    () => ({ schedulesError: null }),
    (error: unknown) => ({
      schedulesError:
        error instanceof SchedulesPartlyUpdated
          ? error.message
          : "Saved, but schedules couldn't be updated; try again",
    }),
  );
}

export const updateTeamTimezoneAction = refusableAction(
  async ({ accountId, timezone }) => {
    const { data: updated, error } = await getSupabaseServerClient()
      .from('accounts')
      .update({ timezone })
      .eq('id', accountId)
      .select('id');

    if (error?.code === CHECK_VIOLATION) {
      throw new Refusal(`${timezone} isn't a supported time zone; pick another`);
    }
    if (error) {
      throw error;
    }
    if (updated.length === 0) {
      throw new Refusal(NEEDS_SETTINGS_MANAGE);
    }

    return moveSchedules(accountId);
  },
  z.object({ accountId: z.uuid(), timezone: z.string().min(1) }),
);

export const retryTeamScheduleSyncAction = refusableAction(
  async ({ accountId }, user) => {
    const { data: canManage } = await getSupabaseServerClient()
      .rpc('has_permission', {
        user_id: user.id,
        account_id: accountId,
        permission_name: 'settings.manage',
      })
      .throwOnError();

    if (!canManage) {
      throw new Refusal(NEEDS_SETTINGS_MANAGE);
    }

    return moveSchedules(accountId);
  },
  z.object({ accountId: z.uuid() }),
);
