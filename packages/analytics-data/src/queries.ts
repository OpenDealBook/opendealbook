import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@tuckin/supabase';

type Client = SupabaseClient<Database>;

type Functions = Database['public']['Functions'];

export type PipelineByStageRow =
  Functions['analytics_pipeline_by_stage']['Returns'][number];
export type DealsAddedLostByMonthRow =
  Functions['analytics_deals_added_lost_by_month']['Returns'][number];
export type MedianDaysInStageRow =
  Functions['analytics_median_days_in_stage']['Returns'][number];
export type ChecklistStatusByDealRow =
  Functions['analytics_checklist_status_by_deal']['Returns'][number];
export type RequestedToReceivedMedian =
  Functions['analytics_requested_to_received_median']['Returns'];
export type ContractTurnsPerDealRow =
  Functions['analytics_contract_turns_per_deal']['Returns'][number];
export type MeetingsHeldVsSkippedRow =
  Functions['analytics_meetings_held_vs_skipped']['Returns'][number];
export type OpenActionItemsByOwnerRow =
  Functions['analytics_open_action_items_by_owner']['Returns'][number];
export type BrokerDealFlowByQuarterRow =
  Functions['analytics_broker_deal_flow_by_quarter']['Returns'][number];

export async function fetchPipelineByStage(
  client: Client,
  accountId: string,
  includeRevenue: boolean,
): Promise<PipelineByStageRow[]> {
  const { data, error } = await client.rpc('analytics_pipeline_by_stage', {
    p_account_id: accountId,
    p_include_revenue: includeRevenue,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function fetchDealsAddedLostByMonth(
  client: Client,
  accountId: string,
): Promise<DealsAddedLostByMonthRow[]> {
  const { data, error } = await client.rpc(
    'analytics_deals_added_lost_by_month',
    { p_account_id: accountId },
  );

  if (error) {
    throw error;
  }

  return data;
}

export async function fetchMedianDaysInStage(
  client: Client,
  accountId: string,
): Promise<MedianDaysInStageRow[]> {
  const { data, error } = await client.rpc('analytics_median_days_in_stage', {
    p_account_id: accountId,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function fetchChecklistStatusByDeal(
  client: Client,
  accountId: string,
): Promise<ChecklistStatusByDealRow[]> {
  const { data, error } = await client.rpc(
    'analytics_checklist_status_by_deal',
    { p_account_id: accountId },
  );

  if (error) {
    throw error;
  }

  return data;
}

export async function fetchRequestedToReceivedMedian(
  client: Client,
  accountId: string,
): Promise<RequestedToReceivedMedian> {
  const { data, error } = await client.rpc(
    'analytics_requested_to_received_median',
    { p_account_id: accountId },
  );

  if (error) {
    throw error;
  }

  return data;
}

export async function fetchContractTurnsPerDeal(
  client: Client,
  accountId: string,
): Promise<ContractTurnsPerDealRow[]> {
  const { data, error } = await client.rpc(
    'analytics_contract_turns_per_deal',
    { p_account_id: accountId },
  );

  if (error) {
    throw error;
  }

  return data;
}

export async function fetchMeetingsHeldVsSkipped(
  client: Client,
  accountId: string,
): Promise<MeetingsHeldVsSkippedRow[]> {
  const { data, error } = await client.rpc(
    'analytics_meetings_held_vs_skipped',
    { p_account_id: accountId },
  );

  if (error) {
    throw error;
  }

  return data;
}

export async function fetchOpenActionItemsByOwner(
  client: Client,
  accountId: string,
): Promise<OpenActionItemsByOwnerRow[]> {
  const { data, error } = await client.rpc(
    'analytics_open_action_items_by_owner',
    { p_account_id: accountId },
  );

  if (error) {
    throw error;
  }

  return data;
}

export async function fetchBrokerDealFlowByQuarter(
  client: Client,
  accountId: string,
  includeRevenue: boolean,
): Promise<BrokerDealFlowByQuarterRow[]> {
  const { data, error } = await client.rpc(
    'analytics_broker_deal_flow_by_quarter',
    { p_account_id: accountId, p_include_revenue: includeRevenue },
  );

  if (error) {
    throw error;
  }

  return data;
}
