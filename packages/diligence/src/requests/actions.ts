'use server';

import { z } from 'zod';

import { enhanceAction } from '@odb/next/actions';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { generateFromTemplate } from '@odb/templates/server';

const sendRequestSchema = z.object({ checklistItemId: z.uuid() });

export const sendRequest = enhanceAction(
  async (input) => {
    const client = getSupabaseServerClient();

    const { data: item } = await client
      .from('checklist_item')
      .select('deal_id, account_id, artifact_id')
      .eq('id', input.checklistItemId)
      .single()
      .throwOnError();

    await generateFromTemplate({
      accountId: item.account_id,
      dealId: item.deal_id,
      templateId: item.artifact_id as string,
      fieldValues: {},
    });

    const { data } = await client
      .from('checklist_item')
      .update({
        status: 'requested',
        requested_at: new Date().toISOString(),
      })
      .eq('id', input.checklistItemId)
      .select('*')
      .single()
      .throwOnError();

    return data;
  },
  { auth: true, schema: sendRequestSchema },
);
