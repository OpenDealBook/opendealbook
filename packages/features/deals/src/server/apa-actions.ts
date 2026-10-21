'use server';

import { APA_NEEDS_COUNSEL } from '@odb/contracts';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { offerIdSchema } from '../schema/offer.schema';
import {
  nextContractVersionOrRefuse,
  generateContract,
} from './generate-contract';
import { Refusal, refusableAction } from './refusal';

export const generateApa = refusableAction(async (data, user) => {
  const client = getSupabaseServerClient();
  const slot = await nextContractVersionOrRefuse({
    client,
    offerId: data.offer_id,
    type: 'apa',
  });

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
    throw new Refusal('An APA can be generated once the LOI is accepted');
  }

  const { data: counselReady } = await client
    .rpc('apa_counsel_ready', { deal_id: offer.deal_id })
    .throwOnError();

  if (!counselReady) {
    throw new Refusal(APA_NEEDS_COUNSEL);
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
    type: 'apa',
  });
}, offerIdSchema);
