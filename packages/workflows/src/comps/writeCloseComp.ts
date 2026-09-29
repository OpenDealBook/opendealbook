import {
  buildDealStatsContributorPackage,
  type ContributorDealInput,
  type DealStatsContributorSubmission,
} from '@odb/comps';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

export interface WriteCloseCompInput {
  dealId: string;
  accountId: string;
  actorUserId?: string;
  deal: ContributorDealInput;
}

export interface ContributorOffer {
  vendor: 'DealStats';
  setContributorMember: boolean;
}

export interface WriteCloseCompResult {
  compId: string;
  contributorPackage: DealStatsContributorSubmission;
  contributorOffer: ContributorOffer;
}

export async function writeCloseComp(
  input: WriteCloseCompInput,
): Promise<WriteCloseCompResult> {
  const client = getSupabaseServerAdminClient();

  const { data, error } = await client
    .from('comp')
    .insert({
      account_id: input.accountId,
      deal_id: input.dealId,
      data_class: 'internal',
      source: 'own_close',
      naics_code: input.deal.naicsCode,
      state: input.deal.state,
      close_date: input.deal.saleDate,
      sale_price: input.deal.salePrice,
      revenue: input.deal.revenue,
      sde: input.deal.sde,
      ebitda: input.deal.ebitda,
      created_by: input.actorUserId ?? null,
    })
    .select('id')
    .single();

  if (error) {
    throw error;
  }

  return {
    compId: data.id,
    contributorPackage: buildDealStatsContributorPackage(input.deal),
    contributorOffer: { vendor: 'DealStats', setContributorMember: true },
  };
}
