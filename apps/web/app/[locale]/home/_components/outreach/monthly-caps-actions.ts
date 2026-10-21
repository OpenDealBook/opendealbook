'use server';

import { z } from 'zod';

import { refusableAction } from '@odb/next/actions/refusable-action';
import { Refusal } from '@odb/next/refusal';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { resumeCappedRuns } from '@odb/workflows/builder/client';

import { DEFAULT_DAILY_CAP, DEFAULT_MAX_TOUCHES } from './outreach-defaults';

const INSUFFICIENT_PRIVILEGE = '42501';
const NEEDS_DEALS_MANAGE = 'Changing caps needs deals.manage';
const CAP_RANGE ='Caps must be between 0 and 100,000';
const monthlyCap = z
  .number()
  .int()
  .min(0, CAP_RANGE)
  .max(100000, CAP_RANGE);

async function requireDealManager(userId: string, accountId: string) {
  const { data: canManage } = await getSupabaseServerClient()
    .rpc('has_permission', {
      user_id: userId,
      account_id: accountId,
      permission_name: 'deals.manage',
    })
    .throwOnError();

  if (!canManage) {
    throw new Refusal(NEEDS_DEALS_MANAGE);
  }
}

async function resume(accountId: string) {
  return resumeCappedRuns({ accountId }).then(
    () => ({ resumeError: null }),
    () => ({
      resumeError: "Saved, but paused runs couldn't be resumed; try again",
    }),
  );
}

export const saveMonthlyCapsAction = refusableAction(
  async ({ accountId, letterMonthlyCap, lookupMonthlyCap, aiMonthlyCap }) => {
    const client = getSupabaseServerClient();
    const caps = {
      letter_monthly_cap: letterMonthlyCap,
      lookup_monthly_cap: lookupMonthlyCap,
      ai_monthly_cap: aiMonthlyCap,
    };

    const { data: updated } = await client
      .from('outreach_setting')
      .update(caps)
      .eq('account_id', accountId)
      .select('account_id')
      .throwOnError();

    if (updated.length === 0) {
      const { error } = await client.from('outreach_setting').insert({
        account_id: accountId,
        daily_cap: DEFAULT_DAILY_CAP,
        max_touches: DEFAULT_MAX_TOUCHES,
        ...caps,
      });

      if (error?.code === INSUFFICIENT_PRIVILEGE) {
        throw new Refusal(NEEDS_DEALS_MANAGE);
      }
      if (error) {
        throw error;
      }
    }

    return resume(accountId);
  },
  z.object({
    accountId: z.uuid(),
    letterMonthlyCap: monthlyCap,
    lookupMonthlyCap: monthlyCap,
    aiMonthlyCap: monthlyCap,
  }),
);

export const retryResumeCappedRunsAction = refusableAction(
  async ({ accountId }, user) => {
    await requireDealManager(user.id, accountId);

    return resume(accountId);
  },
  z.object({ accountId: z.uuid() }),
);
