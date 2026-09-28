'use server';

import { z } from 'zod';

import { appendDealEvent } from '@odb/events';
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

    return appendDealEvent(client, {
      dealId: item.deal_id,
      aggregateType: 'checklist_item',
      aggregateId: input.checklistItemId,
      eventType: 'checklist_item.status_changed',
      payload: {
        status: 'requested',
        requested_at: new Date().toISOString(),
      },
    });
  },
  { auth: true, schema: sendRequestSchema },
);
