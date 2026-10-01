import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Json } from '@odb/supabase';

type Client = SupabaseClient<Database>;

type Functions = Database['public']['Functions'];

export type ActorKind = Database['public']['Enums']['event_actor_kind'];

export type AggregateType =
  | 'deal'
  | 'deal_box'
  | 'checklist_item'
  | 'approval'
  | 'deal_participant'
  | 'dr_document'
  | 'meeting'
  | 'meeting_action_item'
  | 'contract'
  | 'offer';

export type EventType =
  | 'deal.created'
  | 'deal.updated'
  | 'deal.stage_changed'
  | 'deal.duplicate_flagged'
  | 'deal.duplicate_cleared'
  | 'deal.resolved'
  | 'deal.archived'
  | 'deal.unarchived'
  | 'deal.listing_status_changed'
  | 'deal.financials_adopted'
  | 'deal_box.set'
  | 'checklist_item.added'
  | 'checklist_item.removed'
  | 'checklist_item.status_changed'
  | 'checklist_item.rescheduled'
  | 'approval.requested'
  | 'approval.decided'
  | 'deal_participant.added'
  | 'dr_document.added'
  | 'dr_document.moved'
  | 'dr_document.removed'
  | 'meeting.scheduled'
  | 'meeting.updated'
  | 'meeting_action_item.added'
  | 'meeting_action_item.removed'
  | 'meeting_action_item.updated'
  | 'contract.created'
  | 'contract.version_set'
  | 'offer.drafted'
  | 'offer.version_added'
  | 'offer.submitted'
  | 'offer.countered'
  | 'offer.accepted'
  | 'offer.rejected'
  | 'offer.withdrawn'
  | 'offer.expired';

export type AppendDealEventResult = Functions['append_deal_event']['Returns'];

export interface DealEventInput {
  aggregateType: AggregateType;
  aggregateId: string;
  eventType: EventType;
  payload: Json;
  expectedAggregateSeq?: number;
  actorKind?: ActorKind;
}

export type AppendDealEventInput = DealEventInput & { dealId: string };

export async function appendDealEvent(
  client: Client,
  input: AppendDealEventInput,
): Promise<AppendDealEventResult> {
  const { data, error } = await client.rpc('append_deal_event', {
    p_deal_id: input.dealId,
    p_aggregate_type: input.aggregateType,
    p_aggregate_id: input.aggregateId,
    p_event_type: input.eventType,
    p_payload: input.payload,
    ...(input.expectedAggregateSeq !== undefined && {
      p_expected_aggregate_seq: input.expectedAggregateSeq,
    }),
    ...(input.actorKind !== undefined && {
      p_actor_kind: input.actorKind,
    }),
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function appendDealEvents(
  client: Client,
  dealId: string,
  events: DealEventInput[],
): Promise<AppendDealEventResult> {
  const { data, error } = await client.rpc('append_deal_events', {
    p_deal_id: dealId,
    p_events: events.map((event) => ({
      aggregate_type: event.aggregateType,
      aggregate_id: event.aggregateId,
      event_type: event.eventType,
      payload: event.payload,
      ...(event.expectedAggregateSeq !== undefined && {
        expected_aggregate_seq: event.expectedAggregateSeq,
      }),
      ...(event.actorKind !== undefined && {
        actor_kind: event.actorKind,
      }),
    })),
  });

  if (error) {
    throw error;
  }

  return data;
}
