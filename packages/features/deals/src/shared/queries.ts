import type { Enums, Tables } from '@odb/supabase';
import type { getSupabaseBrowserClient } from '@odb/supabase/client';

import { fetchCalcSources } from './calc-citations';
import type { DealFilters } from './keys';

type Client = ReturnType<typeof getSupabaseBrowserClient>;

export async function fetchDeals(
  client: Client,
  accountId: string,
  filters?: DealFilters,
): Promise<Tables<'deal'>[]> {
  let query = client
    .from('deal')
    .select('*, close_date')
    .eq('account_id', accountId);

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
    .select('*, close_date')
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

export async function fetchDealOperatingPeriods(
  client: Client,
  { deal_id }: { deal_id: string },
): Promise<Tables<'deal_operating_period'>[]> {
  const { data, error } = await client
    .from('deal_operating_period')
    .select('*')
    .eq('deal_id', deal_id)
    .order('period_month', { ascending: true });

  if (error) {
    throw error;
  }

  return data;
}

export async function fetchWorksheetRows(
  client: Client,
  { deal_id }: { deal_id: string },
): Promise<Tables<'deal_worksheet_row'>[]> {
  const { data, error } = await client
    .from('deal_worksheet_row')
    .select('*')
    .eq('deal_id', deal_id)
    .order('worksheet_type', { ascending: true })
    .order('sort_order', { ascending: true });

  if (error) {
    throw error;
  }

  return data;
}

export async function fetchDealFinancials(
  client: Client,
  { deal_id }: { deal_id: string },
): Promise<Tables<'deal_financials'> | null> {
  const { data, error } = await client
    .from('deal_financials')
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

interface MyWorkBase {
  id: string;
  title: string;
  deal: { id: string; name: string } | null;
  due_at: string | null;
  done: boolean;
}

export type MyWorkItem = MyWorkBase &
  ({ kind: 'checklist'; status: Enums<'checklist_status'> } | { kind: 'todo' });

export type MyTodos = MyWorkItem[];

const DEAL_NAME = 'deal:deal_id(id, firm(name))';

function dealOf(deal: { id: string; firm: { name: string } } | null) {
  return deal && { id: deal.id, name: deal.firm.name };
}

export async function fetchMyTodos(
  client: Client,
  userId: string,
  accountId: string,
): Promise<MyTodos> {
  const [{ data: checklist }, { data: todos }] = await Promise.all([
    client
      .from('checklist_item')
      .select(`id, title, status, due_at, ${DEAL_NAME}`)
      .eq('owner_user_id', userId)
      .eq('account_id', accountId)
      .throwOnError(),
    client
      .from('personal_todo')
      .select(`id, title, done, due_at, ${DEAL_NAME}`)
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .order('created_at', { ascending: true })
      .throwOnError(),
  ]);

  const items: MyWorkItem[] = [
    ...checklist.map((item) => ({
      kind: 'checklist' as const,
      id: item.id,
      title: item.title,
      status: item.status,
      done: item.status === 'received' || item.status === 'reviewed',
      due_at: item.due_at,
      deal: dealOf(item.deal),
    })),
    ...todos.map((todo) => ({
      kind: 'todo' as const,
      id: todo.id,
      title: todo.title,
      done: todo.done,
      due_at: todo.due_at,
      deal: dealOf(todo.deal),
    })),
  ];

  return items.toSorted((a, b) =>
    (a.due_at ?? '\uffff').localeCompare(b.due_at ?? '\uffff'),
  );
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

export const DEAD_OFFER_STATUSES = ['rejected', 'withdrawn', 'expired'];

export interface DealOffer {
  offer: Tables<'offer'>;
  versions: Tables<'offer_version'>[];
  currentVersion: Tables<'offer_version'> | null;
}

interface DealOffers {
  live: DealOffer | null;
  history: DealOffer[];
}

export async function fetchDealOffers(
  client: Client,
  { deal_id }: { deal_id: string },
): Promise<DealOffers> {
  const [offersResult, draftedResult] = await Promise.all([
    client
      .from('offer')
      .select('*, offer_version(*)')
      .eq('deal_id', deal_id)
      .order('number', { referencedTable: 'offer_version', ascending: true }),
    client
      .from('deal_event')
      .select('aggregate_id')
      .eq('deal_id', deal_id)
      .eq('event_type', 'offer.drafted')
      .order('deal_seq', { ascending: false }),
  ]);

  if (offersResult.error) {
    throw offersResult.error;
  }

  if (draftedResult.error) {
    throw draftedResult.error;
  }

  const offersById = new Map(
    offersResult.data.map(({ offer_version: versions, ...offer }) => [
      offer.id,
      {
        offer,
        versions,
        currentVersion:
          versions.find((version) => version.id === offer.current_version_id) ??
          null,
      },
    ]),
  );
  const offers = draftedResult.data.map(
    ({ aggregate_id }) => offersById.get(aggregate_id)!,
  );

  return {
    live:
      offers.find(({ offer }) => !DEAD_OFFER_STATUSES.includes(offer.status)) ??
      null,
    history: offers.filter(({ offer }) =>
      DEAD_OFFER_STATUSES.includes(offer.status),
    ),
  };
}

export function acceptedOffer({ live }: DealOffers): DealOffer | null {
  return live?.offer.status === 'accepted' ? live : null;
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
    sources: await fetchCalcSources(client, version.data),
  };
}
