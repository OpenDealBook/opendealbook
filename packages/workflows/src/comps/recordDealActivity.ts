import {
  anonymizeDealActivity,
  generatePseudonym,
  poolFingerprint,
  type ActivityConfidence,
  type DealActivityRecord,
} from '@odb/comps';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

export interface RecordDealActivityInput {
  dealId: string;
  dealSeq: number;
}

function deriveConfidence(
  resolution: string | null,
  loiPrice: number | null,
): ActivityConfidence {
  if (resolution !== null) {
    return 'verified';
  }
  if (loiPrice !== null) {
    return 'screened';
  }
  return 'listed';
}

async function loadLoiPrice(
  client: ReturnType<typeof getSupabaseServerAdminClient>,
  dealId: string,
): Promise<number | null> {
  const { data: accepted } = await client
    .from('offer')
    .select('current_version_id')
    .eq('deal_id', dealId)
    .eq('status', 'accepted')
    .maybeSingle()
    .throwOnError();
  if (accepted === null) {
    return null;
  }

  const { data: version } = await client
    .from('offer_version')
    .select('purchase_price')
    .eq('id', accepted.current_version_id!)
    .single()
    .throwOnError();

  return version.purchase_price;
}

export async function recordDealActivity(
  input: RecordDealActivityInput,
): Promise<void> {
  const client = getSupabaseServerAdminClient();

  const { data: deal, error } = await client
    .from('deal')
    .select(
      'account_id, stage, asking_price, resolution, resolution_reason, outcome_reason, created_at',
    )
    .eq('id', input.dealId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (deal === null) {
    console.info(
      `[recordDealActivity] skipping relay event; deal ${input.dealId} no longer exists`,
    );
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

  const loiPrice = await loadLoiPrice(client, input.dealId);

  const record: DealActivityRecord = {
    region,
    naics: null,
    industryShort,
    createdAt: deal.created_at ?? new Date().toISOString(),
    confidence: deriveConfidence(deal.resolution, loiPrice),
    askingPrice: deal.asking_price,
    loiPrice,
    furthestStage: deal.stage,
    outcome: deal.resolution,
    outcomeReason: deal.resolution_reason ?? deal.outcome_reason,
    lossReason:
      deal.resolution === 'lost'
        ? (deal.outcome_reason ?? deal.resolution_reason)
        : null,
  };

  const anon = anonymizeDealActivity(record);

  const { data: existingKey } = await client
    .from('activity_pool_key')
    .select('pseudonym')
    .eq('deal_id', input.dealId)
    .maybeSingle();

  let pseudonym: string;
  if (existingKey) {
    pseudonym = existingKey.pseudonym;
  } else {
    const { data: sequence } = await client
      .rpc('next_pool_pseudonym_number')
      .throwOnError();
    pseudonym = generatePseudonym({
      state: anon.region ?? 'US',
      industryShortName: anon.industryShort ?? 'Business',
      sequence,
    });
    const { error: keyError } = await client.from('activity_pool_key').insert({
      pseudonym,
      deal_id: input.dealId,
      account_id: deal.account_id,
      fingerprint: poolFingerprint({
        region: anon.region,
        naics: anon.naics3,
        quarter: anon.createdQuarter,
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
    created_quarter: anon.createdQuarter,
    confidence: anon.confidence,
    asking_price_banded: anon.askingPriceBanded,
    loi_price_banded: anon.loiPriceBanded,
    furthest_stage: anon.furthestStage,
    outcome: anon.outcome,
    outcome_reason: anon.outcomeReason,
    loss_reason: anon.lossReason,
  };

  const { data: existingRow } = await client
    .from('activity_pool')
    .select('id')
    .eq('pseudonym', pseudonym)
    .maybeSingle();

  if (existingRow) {
    const { error: updateError } = await client
      .from('activity_pool')
      .update(row)
      .eq('id', existingRow.id);
    if (updateError) {
      throw updateError;
    }
    return;
  }

  const { error: insertError } = await client.from('activity_pool').insert(row);
  if (insertError) {
    throw insertError;
  }
}
