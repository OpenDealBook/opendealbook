import {
  anonymizeCloseComp,
  compPoolEligible,
  generatePseudonym,
  poolFingerprint,
  type ClosePoolRecord,
} from '@odb/comps';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

export interface AnonymizeCloseInput {
  dealId: string;
  dealSeq: number;
}

async function loadSalePrice(
  client: ReturnType<typeof getSupabaseServerAdminClient>,
  dealId: string,
): Promise<number | null> {
  const { data: offers } = await client.from('offer').select('id').eq('deal_id', dealId);
  const offerIds = (offers ?? []).map((offer) => offer.id);
  if (offerIds.length === 0) {
    return null;
  }

  const { data: versions } = await client
    .from('offer_version')
    .select('purchase_price')
    .in('offer_id', offerIds)
    .order('purchase_price', { ascending: false })
    .limit(1);

  return versions?.[0]?.purchase_price ?? null;
}

export async function anonymizeClose(input: AnonymizeCloseInput): Promise<void> {
  const client = getSupabaseServerAdminClient();

  const { data: deal, error } = await client
    .from('deal')
    .select('account_id, close_date, revenue_ttm, sde_ttm, asking_price, resolution, resolution_reason, outcome_reason, created_at')
    .eq('id', input.dealId)
    .single();

  if (error) {
    throw error;
  }

  const { data: optin } = await client
    .from('comp_pool_optin')
    .select('opted_in')
    .eq('account_id', deal.account_id)
    .maybeSingle();

  const closeDate = deal.close_date ?? (deal.created_at ?? new Date().toISOString()).slice(0, 10);

  const eligible = compPoolEligible({
    optedIn: optin?.opted_in ?? false,
    outcomeReason: deal.outcome_reason ?? deal.resolution_reason,
    closeDate,
    asOf: new Date().toISOString().slice(0, 10),
  });
  if (!eligible) {
    return;
  }

  const salePrice = (await loadSalePrice(client, input.dealId)) ?? deal.asking_price;
  if (salePrice === null || deal.revenue_ttm === null || deal.sde_ttm === null) {
    return;
  }

  const { data: profile } = await client
    .from('deal_profile')
    .select('industry_id, location_id')
    .eq('deal_id', input.dealId)
    .maybeSingle();

  let region: string | null = null;
  if (profile?.location_id) {
    const { data: location } = await client
      .from('location')
      .select('region')
      .eq('id', profile.location_id)
      .maybeSingle();
    region = location?.region ?? null;
  }

  let industryShort: string | null = null;
  if (profile?.industry_id) {
    const { data: industry } = await client
      .from('industry')
      .select('name')
      .eq('id', profile.industry_id)
      .maybeSingle();
    industryShort = industry?.name ?? null;
  }

  const record: ClosePoolRecord = {
    region,
    naics: null,
    industryShort,
    closeDate,
    salePrice,
    revenue: deal.revenue_ttm,
    sde: deal.sde_ttm,
    outcome: deal.resolution,
  };

  const anon = anonymizeCloseComp(record);

  const { data: existingKey } = await client
    .from('comp_pool_key')
    .select('pseudonym')
    .eq('deal_id', input.dealId)
    .maybeSingle();

  let pseudonym: string;
  if (existingKey) {
    pseudonym = existingKey.pseudonym;
  } else {
    const { count } = await client
      .from('comp_pool_key')
      .select('*', { count: 'exact', head: true });
    pseudonym = generatePseudonym({
      state: anon.region ?? 'US',
      industryShortName: anon.industryShort ?? 'Business',
      sequence: (count ?? 0) + 1,
    });
    const { error: keyError } = await client.from('comp_pool_key').insert({
      pseudonym,
      deal_id: input.dealId,
      account_id: deal.account_id,
      fingerprint: poolFingerprint({
        region: anon.region,
        naics: anon.naics3,
        quarter: anon.closeQuarter,
      }),
    });
    if (keyError) {
      throw keyError;
    }
  }

  const row = {
    pseudonym,
    region: anon.region,
    naics3: anon.naics3,
    industry_short: anon.industryShort,
    close_quarter: anon.closeQuarter,
    sale_price_banded: anon.salePriceBanded,
    revenue_banded: anon.revenueBanded,
    sde_banded: anon.sdeBanded,
    sde_multiple: anon.sdeMultiple,
    outcome: anon.outcome,
  };

  const { data: existingRow } = await client
    .from('comp_pool')
    .select('id')
    .eq('pseudonym', pseudonym)
    .maybeSingle();

  if (existingRow) {
    const { error: updateError } = await client
      .from('comp_pool')
      .update(row)
      .eq('id', existingRow.id);
    if (updateError) {
      throw updateError;
    }
    return;
  }

  const { error: insertError } = await client.from('comp_pool').insert(row);
  if (insertError) {
    throw insertError;
  }
}
