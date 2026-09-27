import type { Enums } from '@tuckin/supabase';
import { getSupabaseServerAdminClient } from '@tuckin/supabase/server';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const DEAL_COLUMNS =
  'id, stage, source, asking_price, revenue_ttm, sde_ttm, ebitda_ttm, firm_id, description, close_date, created_at, updated_at';
const FIRM_COLUMNS =
  'id, name, website, industry, city, state, employee_band, established_year, owner_name, owner_age_estimate, icp_score, service_mix_json, source, source_url, status, imported_at, created_at, updated_at';
const DEAL_BOX_COLUMNS =
  'id, version, criteria_json, broker_summary, created_at, updated_at';
const CHECKLIST_COLUMNS =
  'id, deal_id, title, category, status, outcome, due_at, due_offset_days, requested_at, received_at, reviewed_at, artifact_type, created_at, updated_at';

interface ListParams {
  limit?: number;
  cursor?: string;
}

interface DealListParams extends ListParams {
  stage?: string;
  source?: string;
}

interface FirmListParams extends ListParams {
  status?: string;
}

interface Page<Row> {
  items: Row[];
  nextCursor: string | null;
}

function clampLimit(limit: number | undefined): number {
  if (!limit || limit < 1) {
    return DEFAULT_LIMIT;
  }

  return Math.min(limit, MAX_LIMIT);
}

function paginate<Row extends { id: string }>(
  rows: Row[],
  limit: number,
): Page<Row> {
  const nextCursor = rows.length === limit ? rows[rows.length - 1]!.id : null;

  return { items: rows, nextCursor };
}

export async function listDeals(
  accountId: string,
  params: DealListParams = {},
): Promise<Page<Record<string, unknown>>> {
  const limit = clampLimit(params.limit);
  const client = getSupabaseServerAdminClient();

  let query = client
    .from('deal')
    .select(DEAL_COLUMNS)
    .eq('account_id', accountId)
    .order('id', { ascending: true })
    .limit(limit);

  if (params.stage) {
    query = query.eq('stage', params.stage);
  }

  if (params.source) {
    query = query.eq('source', params.source as Enums<'deal_source'>);
  }

  if (params.cursor) {
    query = query.gt('id', params.cursor);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return paginate((data ?? []) as Array<{ id: string }>, limit);
}

export async function getDeal(
  accountId: string,
  id: string,
): Promise<Record<string, unknown> | null> {
  const client = getSupabaseServerAdminClient();

  const { data, error } = await client
    .from('deal')
    .select(DEAL_COLUMNS)
    .eq('account_id', accountId)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function listFirms(
  accountId: string,
  params: FirmListParams = {},
): Promise<Page<Record<string, unknown>>> {
  const limit = clampLimit(params.limit);
  const client = getSupabaseServerAdminClient();

  let query = client
    .from('firm')
    .select(FIRM_COLUMNS)
    .eq('account_id', accountId)
    .order('id', { ascending: true })
    .limit(limit);

  if (params.status) {
    query = query.eq('status', params.status);
  }

  if (params.cursor) {
    query = query.gt('id', params.cursor);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return paginate((data ?? []) as Array<{ id: string }>, limit);
}

export async function getDealBox(
  accountId: string,
): Promise<Record<string, unknown> | null> {
  const client = getSupabaseServerAdminClient();

  const { data, error } = await client
    .from('deal_box')
    .select(DEAL_BOX_COLUMNS)
    .eq('account_id', accountId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function listChecklistItems(
  accountId: string,
  dealId: string,
  params: ListParams = {},
): Promise<Page<Record<string, unknown>>> {
  const limit = clampLimit(params.limit);
  const client = getSupabaseServerAdminClient();

  let query = client
    .from('checklist_item')
    .select(CHECKLIST_COLUMNS)
    .eq('account_id', accountId)
    .eq('deal_id', dealId)
    .order('id', { ascending: true })
    .limit(limit);

  if (params.cursor) {
    query = query.gt('id', params.cursor);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return paginate((data ?? []) as Array<{ id: string }>, limit);
}
