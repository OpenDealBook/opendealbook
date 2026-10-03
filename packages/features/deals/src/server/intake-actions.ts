'use server';

import { appendDealEvent } from '@odb/events';
import { enhanceAction } from '@odb/next/actions';
import { getSupabaseServerClient } from '@odb/supabase/server';

import {
  createDealFromIntakeSchema,
  rerunDealIntakeSchema,
} from '../schema/deal-intake.schema';
import { createDealCore } from './deal-actions';
import {
  dealFromIntakeDraft,
  dealUpdateFromIntakeDraft,
  extractDealIntake,
} from './deal-intake';

export const createDealFromIntake = enhanceAction(
  async (data, user) => {
    const client = getSupabaseServerClient();
    const draft = await extractDealIntake(client, data.account_id, data.text);

    return createDealCore(client, dealFromIntakeDraft(data.account_id, draft), user.id);
  },
  { auth: true, schema: createDealFromIntakeSchema },
);

export const rerunDealIntake = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    const { data: deal } = await client
      .from('deal')
      .select('account_id')
      .eq('id', data.deal_id)
      .single()
      .throwOnError();

    const draft = await extractDealIntake(client, deal.account_id, data.text);

    await appendDealEvent(client, {
      dealId: data.deal_id,
      aggregateType: 'deal',
      aggregateId: data.deal_id,
      eventType: 'deal.updated',
      payload: dealUpdateFromIntakeDraft(draft),
    });

    return { success: true };
  },
  { auth: true, schema: rerunDealIntakeSchema },
);
