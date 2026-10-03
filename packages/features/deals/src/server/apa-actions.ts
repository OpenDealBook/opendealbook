'use server';

import { appendDealEvent } from '@odb/events';
import { enhanceAction } from '@odb/next/actions';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { offerIdSchema } from '../schema/offer.schema';
import { generateContract } from './generate-contract';

export const generateApa = enhanceAction(
  async (data, user) => {
    const client = getSupabaseServerClient();

    const { data: offer } = await client
      .from('offer')
      .select('deal_id, account_id, current_version_id')
      .eq('id', data.offer_id)
      .single()
      .throwOnError();

    const { data: deal } = await client
      .from('deal')
      .select('stage')
      .eq('id', offer.deal_id)
      .single()
      .throwOnError();

    if (deal.stage !== 'loi_accepted') {
      throw new Error('Deal is not at loi_accepted');
    }

    const { data: version } = await client
      .from('offer_version')
      .select('terms')
      .eq('id', offer.current_version_id as string)
      .single()
      .throwOnError();

    await generateContract({
      client,
      user,
      dealId: offer.deal_id,
      accountId: offer.account_id,
      offerVersionId: offer.current_version_id as string,
      terms: version.terms as Record<string, unknown>,
      type: 'apa',
    });

    await appendDealEvent(client, {
      dealId: offer.deal_id,
      aggregateType: 'deal',
      aggregateId: offer.deal_id,
      eventType: 'deal.stage_changed',
      payload: { stage: 'pa_submitted' },
    });

    return { success: true };
  },
  { auth: true, schema: offerIdSchema },
);
