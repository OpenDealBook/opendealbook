'use server';

import { z } from 'zod';

import { TEAM_READ_ONLY } from '@odb/next';
import { refusableAction } from '@odb/next/actions/refusable-action';
import { Refusal } from '@odb/next/refusal';
import { getSupabaseServerClient } from '@odb/supabase/server';

export const decideMatchReview = refusableAction(
  async ({ reviewId, accept }, user) => {
    const { data: decided, error } = await getSupabaseServerClient()
      .from('business_match_review')
      .update({
        status: accept ? 'accepted' : 'rejected',
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', reviewId)
      .select('id')
      .maybeSingle();

    if (error?.message === 'team is read-only') {
      throw new Refusal(TEAM_READ_ONLY);
    }
    if (error) {
      throw error;
    }
    if (!decided) {
      throw new Refusal('Only deal managers can review matches. Ask a deal manager.');
    }
  },
  z.object({ reviewId: z.uuid(), accept: z.boolean() }),
);
