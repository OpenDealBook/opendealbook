'use server';

import { z } from 'zod';

import { refusableAction } from '@odb/next/actions/refusable-action';
import { Refusal } from '@odb/next/refusal';
import { SampleDealsNotLoaded, seedSampleDeals } from '@odb/seed';
import { getSupabaseServerClient } from '@odb/supabase/server';

const accountSchema = z.object({ accountId: z.string() });

export const reloadSampleData = refusableAction(async (input, user) => {
  const { data: isOwner } = await getSupabaseServerClient()
    .rpc('is_account_owner', { account_id: input.accountId })
    .throwOnError();

  if (!isOwner) {
    throw new Refusal('Only the team owner can reload sample deals.');
  }

  await seedSampleDeals({ accountId: input.accountId, userId: user.id }).catch(
    (error: unknown) => {
      if (error instanceof SampleDealsNotLoaded) {
        throw new Refusal("Example deals couldn't be loaded. Try again.");
      }
      throw error;
    },
  );
}, accountSchema);
