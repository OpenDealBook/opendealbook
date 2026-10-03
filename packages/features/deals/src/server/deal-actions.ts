'use server';

import { appendDealEvent, appendDealEvents, type DealEventInput } from '@odb/events';
import { enhanceAction } from '@odb/next/actions';
import type { TablesInsert } from '@odb/supabase';
import { getSupabaseServerClient } from '@odb/supabase/server';

import {
  approvalSchema,
  decideApprovalSchema,
} from '../schema/approval.schema';
import { updateChecklistItemStatusSchema } from '../schema/checklist-item.schema';
import { dealBoxSchema } from '../schema/deal-box.schema';
import { dealParticipantSchema } from '../schema/deal-participant.schema';
import {
  adoptDealFinancialsSchema,
  dealIdSchema,
  dealSchema,
  setDealListingStatusSchema,
  setDealResolutionSchema,
  updateDealStageSchema,
} from '../schema/deal.schema';
import { firmSchema } from '../schema/firm.schema';
import { fetchAccountStages } from '../shared';

function definedFields(
  fields: Record<string, string | number | undefined>,
): Record<string, string | number> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as Record<string, string | number>;
}

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
    const dealId = crypto.randomUUID();

    await appendDealEvent(client, {
      dealId,
      aggregateType: 'deal',
      aggregateId: dealId,
      eventType: 'deal.created',
      payload: {
        account_id: data.account_id,
        owner_user_id: user.id,
        firm_id: data.firm_id ?? null,
        description: data.description ?? null,
        source: data.source,
        stage: data.stage,
        ...definedFields({
          industry_id: data.industry_id,
          location_id: data.location_id,
          location_raw: data.location_raw,
          employee_band: data.employee_band,
          website: data.website,
          owner_role: data.owner_role,
          reason_for_sale: data.reason_for_sale,
          year_established: data.year_established,
          discovered_at: data.discovered_at,
          capture_method: data.capture_method,
        }),
      },
    });

    return dealId;
  },
  { auth: true, schema: dealSchema },
);

export const updateDealStage = enhanceAction(
  async (data, _user) => {
    const client = getSupabaseServerClient();

    const { data: deal } = await client
      .from('deal')
      .select('account_id')
      .eq('id', data.deal_id)
      .single()
      .throwOnError();

    const events: DealEventInput[] = [
      {
        aggregateType: 'deal',
        aggregateId: data.deal_id,
        eventType: 'deal.stage_changed',
        payload: { stage: data.stage },
      },
    ];

    const stages = await fetchAccountStages(client, deal.account_id);
    const loiStage = stages.find((stage) => stage.key === 'loi');
    const targetStage = stages.find((stage) => stage.key === data.stage);

    if (
      loiStage !== undefined &&
      targetStage !== undefined &&
      targetStage.sort_order > loiStage.sort_order
    ) {
      events.push({
        aggregateType: 'approval',
        aggregateId: crypto.randomUUID(),
        eventType: 'approval.requested',
        payload: { subject: 'stage_move' },
      });
    }

    await appendDealEvents(client, data.deal_id, events);

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
        min_dscr: data.min_dscr ?? null,
        required_personal_cash_flow: data.required_personal_cash_flow ?? null,
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

    const { service_mix_json, ...rest } = data;
    const insert: TablesInsert<'firm'> =
      service_mix_json == null ? rest : { ...rest, service_mix_json };

    const { data: row, error } = await client
      .from('firm')
      .insert(insert)
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

    const participantId = crypto.randomUUID();

    await appendDealEvent(client, {
      dealId: data.deal_id,
      aggregateType: 'deal_participant',
      aggregateId: participantId,
      eventType: 'deal_participant.added',
      payload: {
        user_id: data.user_id,
        party: data.party,
        role: data.role ?? null,
        scope: data.scope,
        permission: data.permission,
        expires_at: data.expires_at ?? null,
      },
    });

    return participantId;
  },
  { auth: true, schema: dealParticipantSchema },
);

const checklistTimestampColumn = {
  requested: 'requested_at',
  received: 'received_at',
  reviewed: 'reviewed_at',
} as const;

export const updateChecklistItemStatus = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();
    const now = new Date().toISOString();

    const column =
      checklistTimestampColumn[
        data.status as keyof typeof checklistTimestampColumn
      ];

    const { data: item } = await client
      .from('checklist_item')
      .select('deal_id')
      .eq('id', data.id)
      .single()
      .throwOnError();

    const payload: Record<string, string> = { status: data.status };

    if (column) {
      payload[column] = now;
    }

    if (data.outcome) {
      payload.outcome = data.outcome;
    }

    await appendDealEvent(client, {
      dealId: item.deal_id,
      aggregateType: 'checklist_item',
      aggregateId: data.id,
      eventType: 'checklist_item.status_changed',
      payload,
    });

    return data.id;
  },
  { auth: true, schema: updateChecklistItemStatusSchema },
);

export const requestApproval = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();
    const approvalId = crypto.randomUUID();

    await appendDealEvent(client, {
      dealId: data.deal_id,
      aggregateType: 'approval',
      aggregateId: approvalId,
      eventType: 'approval.requested',
      payload: { subject: data.subject },
    });

    return approvalId;
  },
  { auth: true, schema: approvalSchema },
);

export const decideApproval = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    const { data: approval } = await client
      .from('approval')
      .select('deal_id')
      .eq('id', data.id)
      .single()
      .throwOnError();

    await appendDealEvent(client, {
      dealId: approval.deal_id,
      aggregateType: 'approval',
      aggregateId: data.id,
      eventType: 'approval.decided',
      payload: { decision: data.decision },
    });

    return data.id;
  },
  { auth: true, schema: decideApprovalSchema },
);

export const setDealResolution = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    await appendDealEvent(client, {
      dealId: data.deal_id,
      aggregateType: 'deal',
      aggregateId: data.deal_id,
      eventType: 'deal.resolved',
      payload: {
        resolution: data.resolution,
        resolution_reason: data.resolution_reason ?? 'closed',
      },
    });

    return { success: true };
  },
  { auth: true, schema: setDealResolutionSchema },
);

export const archiveDeal = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    await appendDealEvent(client, {
      dealId: data.deal_id,
      aggregateType: 'deal',
      aggregateId: data.deal_id,
      eventType: 'deal.archived',
      payload: {},
    });

    return { success: true };
  },
  { auth: true, schema: dealIdSchema },
);

export const unarchiveDeal = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    await appendDealEvent(client, {
      dealId: data.deal_id,
      aggregateType: 'deal',
      aggregateId: data.deal_id,
      eventType: 'deal.unarchived',
      payload: {},
    });

    return { success: true };
  },
  { auth: true, schema: dealIdSchema },
);

export const setDealListingStatus = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    await appendDealEvent(client, {
      dealId: data.deal_id,
      aggregateType: 'deal',
      aggregateId: data.deal_id,
      eventType: 'deal.listing_status_changed',
      payload: { listing_status: data.listing_status },
    });

    return { success: true };
  },
  { auth: true, schema: setDealListingStatusSchema },
);

export const adoptDealFinancials = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    await appendDealEvent(client, {
      dealId: data.deal_id,
      aggregateType: 'deal',
      aggregateId: data.deal_id,
      eventType: 'deal.financials_adopted',
      payload: {
        adopted_revenue: data.adopted_revenue ?? null,
        adopted_sde: data.adopted_sde ?? null,
        adopted_ebitda: data.adopted_ebitda ?? null,
        source_calc_version_id: data.source_calc_version_id ?? null,
      },
    });

    return { success: true };
  },
  { auth: true, schema: adoptDealFinancialsSchema },
);

export const starDeal = enhanceAction(
  async (data, user) => {
    const client = getSupabaseServerClient();

    const { data: deal } = await client
      .from('deal')
      .select('account_id')
      .eq('id', data.deal_id)
      .single()
      .throwOnError();

    await client
      .from('deal_star')
      .upsert(
        {
          user_id: user.id,
          deal_id: data.deal_id,
          account_id: deal.account_id,
        },
        { onConflict: 'user_id,deal_id', ignoreDuplicates: true },
      )
      .throwOnError();

    return { success: true };
  },
  { auth: true, schema: dealIdSchema },
);

export const unstarDeal = enhanceAction(
  async (data, user) => {
    const client = getSupabaseServerClient();

    await client
      .from('deal_star')
      .delete()
      .eq('deal_id', data.deal_id)
      .eq('user_id', user.id)
      .throwOnError();

    return { success: true };
  },
  { auth: true, schema: dealIdSchema },
);
