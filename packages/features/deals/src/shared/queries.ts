import type { Tables } from '@tuckin/supabase';
import type { getSupabaseBrowserClient } from '@tuckin/supabase/client';

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
