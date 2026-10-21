'use server';

import { getSupabaseServerClient } from '@odb/supabase/server';

import { dealBoxScreenPasses } from '../shared/queries';
import { offerIdSchema } from '../schema/offer.schema';
import {
  nextContractVersionOrRefuse,
  generateContract,
} from './generate-contract';
import { Refusal, refusableAction } from './refusal';

export const generateLoi = refusableAction(async (data, user) => {
  const client = getSupabaseServerClient();
  const slot = await nextContractVersionOrRefuse({
    client,
    offerId: data.offer_id,
    type: 'loi',
  });

  const { data: offer } = await client
    .from('offer')
    .select('deal_id, account_id, status, current_version_id')
    .eq('id', data.offer_id)
    .single()
    .throwOnError();

  if (offer.status !== 'accepted') {
    throw new Refusal('This offer has not been accepted yet');
  }

  if (!(await dealBoxScreenPasses(client, offer.deal_id))) {
    throw new Refusal('This deal has not passed the deal box screen');
  }

  const { data: version } = await client
    .from('offer_version')
    .select('terms')
    .eq('id', offer.current_version_id as string)
    .single()
    .throwOnError();

  return generateContract({
    client,
    user,
    dealId: offer.deal_id,
    accountId: offer.account_id,
    offerId: data.offer_id,
    slot,
    offerVersionId: offer.current_version_id as string,
    terms: version.terms as Record<string, unknown>,
    type: 'loi',
  });
}, offerIdSchema);
