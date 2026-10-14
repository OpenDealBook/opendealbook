'use server';

import { getSupabaseServerClient } from '@odb/supabase/server';

import {
  contractRequestSchema,
  countEarlierContractsOrRefuse,
  generateContract,
} from './generate-contract';
import { Refusal, refusableAction } from './refusal';

export const generateApa = refusableAction(async (data, user) => {
  const client = getSupabaseServerClient();
  const earlierContracts = await countEarlierContractsOrRefuse({
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
    earlierContracts,
    offerVersionId: offer.current_version_id as string,
    terms: version.terms as Record<string, unknown>,
    type: 'apa',
    signers: data.signers,
  });
}, contractRequestSchema);
