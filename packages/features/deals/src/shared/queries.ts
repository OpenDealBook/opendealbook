import type { Tables } from '@odb/supabase';
import type { getSupabaseBrowserClient } from '@odb/supabase/client';

import type { DealFilters } from './keys';

type Client = ReturnType<typeof getSupabaseBrowserClient>;

export async function fetchDeals(
  client: Client,
  accountId: string,
  filters?: DealFilters,
): Promise<Tables<'deal'>[]> {
  let query = client.from('deal').select('*').eq('account_id', accountId);

  if (filters?.stage) {
    query = query.eq('stage', filters.stage);
  }

  if (filters?.source) {
    query = query.eq('source', filters.source);
  }

  if (filters?.firm_id) {
    query = query.eq('firm_id', filters.firm_id);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return data;
}

export async function fetchDeal(
  client: Client,
  dealId: string,
): Promise<Tables<'deal'>> {
  const { data, error } = await client
    .from('deal')
    .select('*')
    .eq('id', dealId)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function fetchFirms(
  client: Client,
  accountId: string,
): Promise<Tables<'firm'>[]> {
  const { data, error } = await client
    .from('firm')
    .select('*')
    .eq('account_id', accountId)
    .order('imported_at', { ascending: false });

  if (error) {
    throw error;
  }

  return data;
}

export async function fetchAccountStages(
  client: Client,
  accountId: string,
): Promise<Tables<'pipeline_stage'>[]> {
  const { data, error } = await client
    .from('pipeline_stage')
    .select('*')
    .eq('account_id', accountId)
    .order('sort_order', { ascending: true });

  if (error) {
    throw error;
  }

  return data;
}

export async function fetchDealBox(
  client: Client,
  accountId: string,
): Promise<Tables<'deal_box'> | null> {
  const { data, error } = await client
    .from('deal_box')
    .select('*')
    .eq('account_id', accountId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function fetchChecklistItems(
  client: Client,
  dealId: string,
): Promise<Tables<'checklist_item'>[]> {
  const { data, error } = await client
    .from('checklist_item')
    .select('*')
    .eq('deal_id', dealId)
    .order('due_at', { ascending: true });

  if (error) {
    throw error;
  }

  return data;
}

export interface DealOffer {
  offer: Tables<'offer'>;
  versions: Tables<'offer_version'>[];
  currentVersion: Tables<'offer_version'> | null;
}

// Diff adjacent entries of `versions` with diffOfferTerms from the offer schema.
export async function fetchDealOffer(
  client: Client,
  { deal_id }: { deal_id: string },
): Promise<DealOffer | null> {
  const { data: offer, error: offerError } = await client
    .from('offer')
    .select('*')
    .eq('deal_id', deal_id)
    .maybeSingle();

  if (offerError) {
    throw offerError;
  }

  if (!offer) {
    return null;
  }

  const { data: versions, error: versionsError } = await client
    .from('offer_version')
    .select('*')
    .eq('offer_id', offer.id)
    .order('number', { ascending: true });

  if (versionsError) {
    throw versionsError;
  }

  const currentVersion =
    versions.find((version) => version.id === offer.current_version_id) ?? null;

  return { offer, versions, currentVersion };
}

export async function fetchDealParticipants(
  client: Client,
  dealId: string,
): Promise<Tables<'deal_participant'>[]> {
  const { data, error } = await client
    .from('deal_participant')
    .select('*')
    .eq('deal_id', dealId);

  if (error) {
    throw error;
  }

  return data;
}

export async function fetchDealCalcVersions(
  client: Client,
  params: { deal_id: string },
): Promise<Tables<'calc_version'>[]> {
  const { data, error } = await client
    .from('calc_version')
    .select('*')
    .eq('deal_id', params.deal_id)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return data;
}

export async function fetchCalcVersion(
  client: Client,
  params: { calc_version_id: string },
) {
  const [version, periods, input, funding] = await Promise.all([
    client
      .from('calc_version')
      .select('*')
      .eq('id', params.calc_version_id)
      .single(),
    client
      .from('sde_period')
      .select('*, sde_line(*)')
      .eq('calc_version_id', params.calc_version_id),
    client
      .from('deal_calc_input')
      .select('*')
      .eq('calc_version_id', params.calc_version_id)
      .maybeSingle(),
    client
      .from('funding_source')
      .select('*')
      .eq('calc_version_id', params.calc_version_id),
  ]);

  if (version.error) {
    throw version.error;
  }
  if (periods.error) {
    throw periods.error;
  }
  if (input.error) {
    throw input.error;
  }
  if (funding.error) {
    throw funding.error;
  }

  return {
    version: version.data,
    periods: periods.data,
    input: input.data,
    funding_sources: funding.data,
  };
}
