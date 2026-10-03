'use server';

import { appendDealEvent } from '@odb/events';
import { enhanceAction } from '@odb/next/actions';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { dealBoxScreenPasses } from '../shared/queries';
import { offerIdSchema } from '../schema/offer.schema';

export const generateLoi = enhanceAction(
  async (data, user) => {
    const client = getSupabaseServerClient();

    const { data: offer } = await client
      .from('offer')
      .select('deal_id, account_id, status, current_version_id')
      .eq('id', data.offer_id)
      .single()
      .throwOnError();

    if (offer.status !== 'accepted') {
      throw new Error('Offer is not accepted');
    }

    if (!(await dealBoxScreenPasses(client, offer.deal_id))) {
      throw new Error('Deal has not passed the deal box screen');
    }

    const { data: version } = await client
      .from('offer_version')
      .select('terms')
      .eq('id', offer.current_version_id as string)
      .single()
      .throwOnError();

    const contractId = crypto.randomUUID();

    await appendDealEvent(client, {
      dealId: offer.deal_id,
      aggregateType: 'contract',
      aggregateId: contractId,
      eventType: 'contract.created',
      payload: {
        type: 'loi',
        status: 'draft',
        current_version: 0,
        source_offer_version_id: offer.current_version_id,
      },
    });

    await client
      .from('generated_document')
      .insert({
        account_id: offer.account_id,
        deal_id: offer.deal_id,
        contract_id: contractId,
        values_json: version.terms,
        created_by: user.id,
      })
      .throwOnError();

    return { success: true };
  },
  { auth: true, schema: offerIdSchema },
);
