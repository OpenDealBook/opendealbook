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

export interface DealBoxScreenBreakdown {
  dscr: number;
  minDscr: number | null;
  dscrPass: boolean | null;
  netCashFlow: number;
  requiredPersonalCashFlow: number | null;
  cashFlowPass: boolean | null;
  pass: boolean;
}

export type DealBoxScreen =
  | { status: 'no_financials' }
  | { status: 'no_criteria' }
  | ({ status: 'screened' } & DealBoxScreenBreakdown);

export function evaluateDealBoxScreen(input: {
  dscr: number | null;
  netCashFlow: number | null;
  minDscr: number | null;
  requiredPersonalCashFlow: number | null;
}): DealBoxScreenBreakdown {
  const dscr = input.dscr ?? 0;
  const netCashFlow = input.netCashFlow ?? 0;
  const dscrPass = input.minDscr === null ? null : dscr >= input.minDscr;
  const cashFlowPass =
    input.requiredPersonalCashFlow === null
      ? null
      : netCashFlow >= input.requiredPersonalCashFlow;

  return {
    dscr,
    minDscr: input.minDscr,
    dscrPass,
    netCashFlow,
    requiredPersonalCashFlow: input.requiredPersonalCashFlow,
    cashFlowPass,
    pass: dscrPass !== false && cashFlowPass !== false,
  };
}

export async function dealBoxScreen(
  client: Client,
  dealId: string,
): Promise<DealBoxScreen> {
  const { data: financials, error } = await client
    .from('deal_financials')
    .select('account_id, source_calc_version_id')
    .eq('deal_id', dealId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!financials) {
    return { status: 'no_financials' };
  }

  const box = await fetchDealBox(client, financials.account_id);

  if (
    box === null ||
    (box.min_dscr === null && box.required_personal_cash_flow === null)
  ) {
    return { status: 'no_criteria' };
  }

  const { data: calc, error: calcError } = await client
    .from('calc_version')
    .select('outputs_snapshot')
    .eq('id', financials.source_calc_version_id as string)
    .single();

  if (calcError) {
    throw calcError;
  }

  const snapshot = calc.outputs_snapshot as {
    dscr?: number;
    net_cash_flow?: number;
  };

  return {
    status: 'screened',
    ...evaluateDealBoxScreen({
      dscr: snapshot.dscr ?? null,
      netCashFlow: snapshot.net_cash_flow ?? null,
      minDscr: box.min_dscr,
      requiredPersonalCashFlow: box.required_personal_cash_flow,
    }),
  };
}

export async function dealBoxScreenPasses(
  client: Client,
  dealId: string,
): Promise<boolean> {
  const screen = await dealBoxScreen(client, dealId);

  return (
    screen.status === 'no_criteria' ||
    (screen.status === 'screened' && screen.pass)
  );
}

export async function fetchDealThesis(
  client: Client,
  { deal_id }: { deal_id: string },
): Promise<Tables<'deal_thesis'> | null> {
  const { data, error } = await client
    .from('deal_thesis')
    .select('*')
    .eq('deal_id', deal_id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function fetchDealDiscovery(
  client: Client,
  { deal_id }: { deal_id: string },
): Promise<Tables<'deal_discovery'> | null> {
  const { data, error } = await client
    .from('deal_discovery')
    .select('*')
    .eq('deal_id', deal_id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function fetchDealValueMarkers(
  client: Client,
  { deal_id }: { deal_id: string },
): Promise<Tables<'deal_value_marker'>[]> {
  const { data, error } = await client
    .from('deal_value_marker')
    .select('*')
    .eq('deal_id', deal_id);

  if (error) {
    throw error;
  }

  return data;
}

type AssignedChecklistItem = Tables<'checklist_item'> & {
  deal: { id: string; description: string | null } | null;
};

export interface AssignedChecklistGroup {
  deal: { id: string; description: string | null };
  items: AssignedChecklistItem[];
}

export interface MyTodos {
  assigned: AssignedChecklistGroup[];
  personal: Tables<'personal_todo'>[];
}

export async function fetchMyTodos(
  client: Client,
  userId: string,
): Promise<MyTodos> {
  const [assignedResult, personalResult] = await Promise.all([
    client
      .from('checklist_item')
      .select('*, deal:deal_id(id, description)')
      .eq('owner_user_id', userId)
      .order('due_at', { ascending: true }),
    client
      .from('personal_todo')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true }),
  ]);

  if (assignedResult.error) {
    throw assignedResult.error;
  }

  if (personalResult.error) {
    throw personalResult.error;
  }

  const groups = new Map<string, AssignedChecklistGroup>();

  for (const item of assignedResult.data as unknown as AssignedChecklistItem[]) {
    const existing = groups.get(item.deal_id);

    if (existing) {
      existing.items.push(item);
      continue;
    }

    groups.set(item.deal_id, {
      deal: { id: item.deal_id, description: item.deal?.description ?? null },
      items: [item],
    });
  }

  return {
    assigned: [...groups.values()],
    personal: personalResult.data,
  };
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
