'use server';

import { z } from 'zod';

import { enhanceAction } from '@tuckin/next/actions';
import { hasSampleData, seedSampleDeals } from '@tuckin/seed';
import { getSupabaseServerClient } from '@tuckin/supabase/server';

const accountSchema = z.object({ accountId: z.string() });

export const ensureTrialSampleData = enhanceAction(
  async (input, user) => {
    const client = getSupabaseServerClient();

    const { data: isActive } = await client.rpc('is_trial_active', {
      p_account_id: input.accountId,
    });

    if (!isActive || (await hasSampleData(input.accountId))) {
      return;
    }

    await seedSampleDeals({ accountId: input.accountId, userId: user.id });
  },
  { auth: true, schema: accountSchema },
);

export const reloadSampleData = enhanceAction(
  async (input, user) => {
    await seedSampleDeals({ accountId: input.accountId, userId: user.id });
  },
  { auth: true, schema: accountSchema },
);
