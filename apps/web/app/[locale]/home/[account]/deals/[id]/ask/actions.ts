'use server';

import { z } from 'zod';

import { enhanceAction } from '@odb/next/actions';
import { getSupabaseServerClient } from '@odb/supabase/server';

export const deleteDealAiQuestion = enhanceAction(
  async ({ id }) => {
    const { data: deleted } = await getSupabaseServerClient()
      .from('deal_ai_question')
      .delete()
      .eq('id', id)
      .select('id')
      .throwOnError();
    return deleted.length > 0;
  },
  { auth: true, schema: z.object({ id: z.uuid() }) },
);
