'use server';

import { appendDealEvent, appendDealEvents, type DealEventInput } from '@odb/events';
import { enhanceAction } from '@odb/next/actions';
import { getSupabaseServerClient } from '@odb/supabase/server';

import {
  approvalSchema,
  decideApprovalSchema,
} from '../schema/approval.schema';
import { updateChecklistItemStatusSchema } from '../schema/checklist-item.schema';
import { dealBoxSchema } from '../schema/deal-box.schema';
import { dealParticipantSchema } from '../schema/deal-participant.schema';
import {
  type AdoptDealFinancialsPayload,
  adoptDealFinancialsSchema,
  type DealPayload,
  dealIdSchema,
  dealSchema,
  setDealListingStatusSchema,
  setDealResolutionSchema,
  setEarningsBasisSchema,
  updateDealStageSchema,
} from '../schema/deal.schema';
import { fetchAccountStages } from '../shared';
import { Refusal, refusableAction } from './refusal';

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

export async function createDealCore(
  client: ReturnType<typeof getSupabaseServerClient>,
  data: DealPayload,
  userId: string,
): Promise<string> {
  const dealId = crypto.randomUUID();
  const firmId = crypto.randomUUID();

  await client
    .from('firm')
    .insert({
      id: firmId,
      account_id: data.account_id,
      name: data.business_name,
      status: 'deal_created',
    })
    .throwOnError();

  await appendDealEvent(client, {
    dealId,
    aggregateType: 'deal',
    aggregateId: dealId,
    eventType: 'deal.created',
    payload: {
      account_id: data.account_id,
      owner_user_id: userId,
      firm_id: firmId,
      description: data.description ?? null,
      source: data.source,
      stage: data.stage,
      ...definedFields({
        asking_price: data.asking_price,
        revenue_ttm: data.revenue_ttm,
        sde_ttm: data.sde_ttm,
        ebitda_ttm: data.ebitda_ttm,
        industry_id: data.industry_id,
        industry: data.industry,
        business_model: data.business_model,
        location_id: data.location_id,
        location_raw: data.location_raw,
        employee_band: data.employee_band,
        website: data.website,
        owner_role: data.owner_role,
        reason_for_sale: data.reason_for_sale,
        year_established: data.year_established,
        discovered_at: data.discovered_at,
        source_url: data.source_url,
      }),
    },
  });

  return dealId;
}

export const createDeal = refusableAction(
  async (data, user) => createDealCore(getSupabaseServerClient(), data, user.id),
  dealSchema,
);

export const updateDealStage = refusableAction(
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
  updateDealStageSchema,
  {
    what: 'change the deal stage',
    needs: 'deals.manage',
    dealId: (data) => data.deal_id,
  },
);

export const upsertDealBox = refusableAction(
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
  dealBoxSchema,
  { what: 'edit the deal box', needs: 'deals.manage' },
);

export const addDealParticipant = refusableAction(
  async (data) => {
    const client = getSupabaseServerClient();

    const { data: allowed } = await client.rpc('has_deal_permission', {
      deal_id: data.deal_id,
      permission: 'participants.manage',
    });

    if (!allowed) {
      throw new Refusal('Only deal managers can add people to a deal.');
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
  dealParticipantSchema,
);

const checklistTimestampColumn = {
  requested: 'requested_at',
  received: 'received_at',
  reviewed: 'reviewed_at',
} as const;

export const updateChecklistItemStatus = refusableAction(
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
  updateChecklistItemStatusSchema,
  { what: 'change checklist status', needs: 'checklists.manage' },
);

export const requestApproval = refusableAction(
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
  approvalSchema,
  {
    what: 'request approvals',
    needs: 'deals.manage',
    dealId: (data) => data.deal_id,
  },
);

export const decideApproval = refusableAction(
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
  decideApprovalSchema,
  { what: 'decide approvals', needs: 'deals.manage' },
);

export const setDealResolution = refusableAction(
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
  setDealResolutionSchema,
  {
    what: 'close out deals',
    needs: 'deals.manage',
    dealId: (data) => data.deal_id,
  },
);

export const archiveDeal = refusableAction(
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
  dealIdSchema,
  {
    what: 'archive deals',
    needs: 'deals.manage',
    dealId: (data) => data.deal_id,
  },
);

export const unarchiveDeal = refusableAction(
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
  dealIdSchema,
  {
    what: 'unarchive deals',
    needs: 'deals.manage',
    dealId: (data) => data.deal_id,
  },
);

export const setDealListingStatus = refusableAction(
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
  setDealListingStatusSchema,
  {
    what: 'change the listing status',
    needs: 'deals.manage',
    dealId: (data) => data.deal_id,
  },
);

export const setEarningsBasis = refusableAction(
  async (data) => {
    await appendDealEvent(getSupabaseServerClient(), {
      dealId: data.deal_id,
      aggregateType: 'deal',
      aggregateId: data.deal_id,
      eventType: 'deal.earnings_basis_changed',
      payload: { earnings_basis: data.earnings_basis },
    });

    return { success: true };
  },
  setEarningsBasisSchema,
  {
    what: 'change the earnings basis',
    needs: 'deals.manage',
    dealId: (data) => data.deal_id,
  },
);

export async function adoptDealFinancialsCore(
  client: ReturnType<typeof getSupabaseServerClient>,
  data: AdoptDealFinancialsPayload,
): Promise<void> {
  await appendDealEvent(client, {
    dealId: data.deal_id,
    aggregateType: 'deal',
    aggregateId: data.deal_id,
    eventType: 'deal.financials_adopted',
    payload: {
      adopted_revenue: data.adopted_revenue ?? null,
      adopted_sde: data.adopted_sde ?? null,
      adopted_ebitda: data.adopted_ebitda ?? null,
      adopted_years: data.adopted_years ?? null,
      source_calc_version_id: data.source_calc_version_id ?? null,
    },
  });
}

export const adoptDealFinancials = refusableAction(
  async (data) => {
    await adoptDealFinancialsCore(getSupabaseServerClient(), data);

    return { success: true };
  },
  adoptDealFinancialsSchema,
  {
    what: 'adopt financials',
    needs: 'deals.manage',
    dealId: (data) => data.deal_id,
  },
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
