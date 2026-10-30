import type { SupabaseClient } from '@supabase/supabase-js';

import type { EventType } from '@odb/events';
import type { Database, Json } from '@odb/supabase';

export interface DealActivityEntry {
  id: string;
  who: string;
  what: string;
  at: string;
}

type Payload = Record<string, Json | undefined>;
type Describe = (
  payload: Payload,
  stageName: (key: string) => string,
) => string;

const WAITING_ON_PHRASES: Record<string, string> = {
  us: 'us',
  seller: 'the seller',
  counsel: 'counsel',
  lender: 'the lender',
  null: 'no one',
};

const PHRASES: Record<
  EventType | 'deal.loi_signed' | 'lender_room.went_quiet',
  Describe
> = {
  'deal.created': (p, stageName) =>
    `created the deal in ${stageName(String(p.stage))}`,
  'deal.updated': () => 'updated the deal',
  'deal.stage_changed': (p, stageName) =>
    `moved the deal to ${stageName(String(p.stage))}`,
  'deal.duplicate_flagged': () => 'flagged the deal as a possible duplicate',
  'deal.duplicate_cleared': () => 'cleared the duplicate flag',
  'deal.resolved': (p) => `marked the deal ${p.resolution}`,
  'deal.archived': () => 'archived the deal',
  'deal.unarchived': () => 'restored the deal from the archive',
  'deal.listing_status_changed': () => 'changed the listing status',
  'deal.financials_adopted': () => 'adopted financials',
  'deal.earnings_basis_changed': () => 'changed the earnings basis',
  'deal.close_deadline_set': () => 'set the must-close-by date',
  'deal.loi_signed': () => 'LOI signed',
  'lender_room.went_quiet': (p) => `${p.lender_name} went quiet`,
  'deal_box.set': () => 'set the deal box',
  'checklist_item.added': (p) => `added checklist item "${p.title}"`,
  'checklist_item.removed': () => 'removed a checklist item',
  'checklist_item.status_changed': (p) => `marked a checklist item ${p.status}`,
  'checklist_item.rescheduled': () => 'rescheduled a checklist item',
  'checklist_item.details_set': () =>
    "changed a checklist item's owner, importance or due date",
  'checklist_item.waiting_on_set': (p) =>
    `marked a checklist item waiting on ${WAITING_ON_PHRASES[String(p.waiting_on)]}`,
  'checklist_item.note_posted': () => 'added a note to a checklist item',
  'checklist_item.document_linked': (p) =>
    p.document_id === null
      ? 'unlinked the document from a checklist item'
      : 'linked a document to a checklist item',
  'approval.requested': () => 'requested an approval',
  'approval.decided': () => 'decided an approval',
  'deal_participant.added': () => 'added a participant',
  'dr_document.added': (p) => `uploaded "${p.name}"`,
  'dr_document.moved': () => 'moved a document',
  'dr_document.removed': () => 'removed a document',
  'meeting.scheduled': () => 'scheduled a meeting',
  'meeting.updated': () => 'updated a meeting',
  'meeting_action_item.added': () => 'added a meeting action item',
  'meeting_action_item.removed': () => 'removed a meeting action item',
  'meeting_action_item.updated': () => 'updated a meeting action item',
  'contract.created': () => 'started a contract',
  'contract.version_set': () => 'changed the current contract version',
  'contract.version_added': () => 'added a contract version',
  'contract.version_shown_to_seller_side': () =>
    'shared a contract version with the seller',
  'contract.comment_posted': () => 'commented on a contract',
  'contract.signature_requested': () => 'sent a contract for signature',
  'contract.signature_status_changed': (p) =>
    `recorded a contract signature as ${p.status}`,
  'contract.extension_noted': () => 'noted an LOI extension',
  'contract.extension_rescheduled': () =>
    "changed an LOI extension's end date",
  'offer.drafted': () => 'drafted an offer',
  'offer.version_added': () => 'revised an offer',
  'offer.submitted': () => 'submitted an offer',
  'offer.countered': () => 'countered an offer',
  'offer.accepted': () => 'accepted an offer',
  'offer.rejected': () => 'rejected an offer',
  'offer.withdrawn': () => 'withdrew an offer',
  'offer.expired': () => 'marked an offer expired',
  'deal_milestone.set': (p) =>
    p.kind === 'custom' ? `set milestone "${p.label}"` : 'set a milestone date',
  'deal_milestone.removed': () => 'removed a milestone',
  'deal_update.sent': (p) => `sent the update "${p.subject}"`,
};

export function describeDealEvent(
  eventType: string,
  payload: Json,
  stageName: (key: string) => string,
): string {
  const describe = PHRASES[eventType as keyof typeof PHRASES];

  return describe
    ? describe(payload as Payload, stageName)
    : eventType.replace(/[._]/g, ' ');
}

const PAGE_SIZE = 50;

export async function fetchDealActivity(
  client: SupabaseClient<Database>,
  dealId: string,
  accountId: string,
  page: number,
): Promise<{ entries: DealActivityEntry[]; more: boolean }> {
  const [{ data: events }, { data: people }, { data: stages }] =
    await Promise.all([
      client
        .from('deal_event')
        .select('id, event_type, payload, actor_kind, actor_ref, created_at')
        .eq('deal_id', dealId)
        .order('deal_seq', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
        .throwOnError(),
      client.rpc('deal_people', { deal_id: dealId }).throwOnError(),
      client
        .from('pipeline_stage')
        .select('key, label')
        .eq('account_id', accountId)
        .throwOnError(),
    ]);
  const names = new Map(people.map((person) => [person.user_id, person.name]));
  const stageLabels = new Map(stages.map((stage) => [stage.key, stage.label]));
  const stageName = (key: string) => stageLabels.get(key)!;

  const entries = events.slice(0, PAGE_SIZE).map((event) => ({
    id: event.id,
    who:
      event.actor_kind === 'user'
        ? (names.get(event.actor_ref!) ?? 'A former participant')
        : 'Open Deal Book',
    what: describeDealEvent(event.event_type, event.payload, stageName),
    at: event.created_at,
  }));

  return { entries, more: events.length > PAGE_SIZE };
}
