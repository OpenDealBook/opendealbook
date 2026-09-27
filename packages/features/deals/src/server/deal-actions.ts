'use server';

import { enhanceAction } from '@tuckin/next/actions';
import type { TablesInsert, TablesUpdate } from '@tuckin/supabase';
import { getSupabaseServerClient } from '@tuckin/supabase/server';

import {
  approvalSchema,
  decideApprovalSchema,
} from '../schema/approval.schema';
import { updateChecklistItemStatusSchema } from '../schema/checklist-item.schema';
import { dealBoxSchema } from '../schema/deal-box.schema';
import { dealParticipantSchema } from '../schema/deal-participant.schema';
import { dealSchema, updateDealStageSchema } from '../schema/deal.schema';
import { firmSchema } from '../schema/firm.schema';
import { fetchAccountStages } from '../shared';

async function currentDealBoxVersion(
  client: ReturnType<typeof getSupabaseServerClient>,
  accountId: string,
): Promise<number | null> {
  const { data } = await client
    .from('deal_box')
    .select('version')
    .eq('account_id', accountId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.version ?? null;
}

export const createDeal = enhanceAction(
  async (data, user) => {
    const client = getSupabaseServerClient();

    const dealBoxVersion = await currentDealBoxVersion(client, data.account_id);

    const insert: TablesInsert<'deal'> = {
      account_id: data.account_id,
      owner_user_id: user.id,
      firm_id: data.firm_id ?? null,
      description: data.description ?? null,
      asking_price: data.asking_price ?? null,
      revenue_ttm: data.revenue_ttm ?? null,
      sde_ttm: data.sde_ttm ?? null,
      ebitda_ttm: data.ebitda_ttm ?? null,
      source: data.source,
      stage: data.stage,
      notes: data.notes ?? null,
      deal_box_version: dealBoxVersion,
    };

    const { data: row, error } = await client
      .from('deal')
      .insert(insert)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return row;
  },
  { auth: true, schema: dealSchema },
);

export const updateDealStage = enhanceAction(
  async (data, user) => {
    const client = getSupabaseServerClient();
    const now = new Date().toISOString();

    const { data: deal } = await client
      .from('deal')
      .select('account_id, stage')
      .eq('id', data.deal_id)
      .single()
      .throwOnError();

    await client
      .from('deal')
      .update({ stage: data.stage, updated_at: now })
      .eq('id', data.deal_id)
      .throwOnError();

    await client
      .from('audit_event')
      .insert({
        account_id: deal.account_id,
        deal_id: data.deal_id,
        actor_user_id: user.id,
        event_type: 'stage_move',
        payload: { from: deal.stage, to: data.stage },
      })
      .throwOnError();

    const stages = await fetchAccountStages(client, deal.account_id);
    const loiStage = stages.find((stage) => stage.key === 'loi');
    const targetStage = stages.find((stage) => stage.key === data.stage);

    if (
      loiStage !== undefined &&
      targetStage !== undefined &&
      targetStage.sort_order > loiStage.sort_order
    ) {
      await client
        .from('approval')
        .insert({
          deal_id: data.deal_id,
          subject: 'stage_move',
          requested_by: user.id,
        })
        .throwOnError();
    }

    return { success: true };
  },
  { auth: true, schema: updateDealStageSchema },
);

export const upsertDealBox = enhanceAction(
  async (data, user) => {
    const client = getSupabaseServerClient();

    const previous = await currentDealBoxVersion(client, data.account_id);

    const { data: row, error } = await client
      .from('deal_box')
      .insert({
        account_id: data.account_id,
        version: (previous ?? 0) + 1,
        criteria_json: data.criteria_json,
        broker_summary: data.broker_summary ?? null,
        updated_by: user.id,
      })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return row;
  },
  { auth: true, schema: dealBoxSchema },
);

export const createFirm = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    const { data: row, error } = await client
      .from('firm')
      .insert(data)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return row;
  },
  { auth: true, schema: firmSchema },
);

export const addDealParticipant = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    const { data: allowed } = await client.rpc('has_deal_permission', {
      deal_id: data.deal_id,
      permission: 'participants.manage',
    });

    if (!allowed) {
      throw new Error('Not permitted to manage participants');
    }

    const { data: row, error } = await client
      .from('deal_participant')
      .insert(data)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return row;
  },
  { auth: true, schema: dealParticipantSchema },
);

const checklistTimestampColumn = {
  requested: 'requested_at',
  received: 'received_at',
  reviewed: 'reviewed_at',
} as const;

export const updateChecklistItemStatus = enhanceAction(
  async (data, user) => {
    const client = getSupabaseServerClient();
    const now = new Date().toISOString();

    const column =
      checklistTimestampColumn[
        data.status as keyof typeof checklistTimestampColumn
      ];

    const update: TablesUpdate<'checklist_item'> = { status: data.status };

    if (column) {
      update[column] = now;
    }

    if (data.status === 'reviewed') {
      update.reviewed_by = user.id;
    }

    if (data.outcome) {
      update.outcome = data.outcome;
    }

    const { data: row, error } = await client
      .from('checklist_item')
      .update(update)
      .eq('id', data.id)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return row;
  },
  { auth: true, schema: updateChecklistItemStatusSchema },
);

export const requestApproval = enhanceAction(
  async (data, user) => {
    const client = getSupabaseServerClient();

    const { data: row, error } = await client
      .from('approval')
      .insert({
        deal_id: data.deal_id,
        subject: data.subject,
        requested_by: user.id,
      })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return row;
  },
  { auth: true, schema: approvalSchema },
);

export const decideApproval = enhanceAction(
  async (data, user) => {
    const client = getSupabaseServerClient();

    const { data: row, error } = await client
      .from('approval')
      .update({
        decision: data.decision,
        decided_by: user.id,
        decided_at: new Date().toISOString(),
      })
      .eq('id', data.id)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return row;
  },
  { auth: true, schema: decideApprovalSchema },
);
