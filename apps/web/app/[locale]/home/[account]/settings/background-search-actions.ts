'use server';

import { z } from 'zod';

import { refusableAction } from '@odb/next/actions/refusable-action';
import { Refusal } from '@odb/next/refusal';
import { getSupabaseServerClient } from '@odb/supabase/server';

export const updateNameSpellingAction = refusableAction(
  async ({ accountId, spelling }) => {
    const { data: updated } = await getSupabaseServerClient()
      .from('accounts')
      .update({ diligence_name_spelling: spelling })
      .eq('id', accountId)
      .select('id')
      .throwOnError();

    if (updated.length === 0) {
      throw new Refusal(
        'Changing background search settings needs settings.manage',
      );
    }
  },
  z.object({
    accountId: z.uuid(),
    spelling: z.enum(['source_priority', 'newest_record']),
  }),
);
