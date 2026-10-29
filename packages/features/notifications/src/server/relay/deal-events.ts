export interface NotifiableDealEvent {
  globalSeq: number;
  dealId: string;
  accountId: string;
  actorRef: string | null;
  eventType: string;
  stage: string | null;
}

export interface DealEventNotificationStep {
  event: NotifiableDealEvent;
  workflowId: string;
}

export interface DealEventNotificationPlan {
  steps: DealEventNotificationStep[];
  cursor: number;
}

export const LENDER_ROOM_DOCUMENTS_WORKFLOW_ID = 'lender-room-documents';
export const SELLER_ROOM_SHARED_WORKFLOW_ID = 'seller-room-shared';
export const SELLER_ROOM_ACTIVITY_WORKFLOW_ID = 'seller-room-activity';
export const SELLER_ROOM_ACCESS_REQUESTED_WORKFLOW_ID =
  'seller_room.access_requested';
export const SELLER_ROOM_CLOSED_WORKFLOW_ID = 'seller_room.closed';
export const SELLER_ROOM_REOPENED_WORKFLOW_ID = 'seller_room.reopened';
export const COUNSEL_MESSAGE_WORKFLOW_ID = 'counsel-message';
export const DEAL_UPDATE_SUBMITTED_WORKFLOW_ID = 'deal-update-submitted';
export const COUNSEL_UPLOADS_WORKFLOW_ID = 'counsel-uploads';
export const CONTRACT_NEGOTIATION_WORKFLOW_ID = 'contract-negotiation';
export const TODO_ASSIGNED_WORKFLOW_ID = 'todo.assigned';
export const DEAL_DELETED_WORKFLOW_ID = 'deal.deleted';
export const SELLER_COUNSEL_FOLDER_WORKFLOW_ID =
  'seller-counsel-folder.file-added';
export const SELLER_COUNSEL_MESSAGE_WORKFLOW_ID =
  'seller-counsel-message.posted';

export function dealPath(accountSlug: string, dealId: string): string {
  return `/home/${accountSlug}/deals/${dealId}`;
}

const TEAM_TAB = {
  'checklist-item': '/diligence',
  todo: '/todos',
  'seller-question': '/parties',
  'counsel-message': '/parties',
  'contract-version': '/documents',
  'contract-review': '/documents',
  'contract-comment': '/documents',
  offer: '/financials',
  'deal-update': '',
  milestone: '',
  'must-close-by': '/lenders',
  'lender-timeline-answer': '/lenders',
} as const;

const COUNSEL_PAGE = {
  'contract-version': '/contracts',
  'contract-review': '/contracts',
  'contract-comment': '/contracts',
  'counsel-message': '/messages',
  'seller-counsel-message': '/client',
} as const;

const SELLER_PAGE = {
  'contract-version': '/contracts',
  'contract-review': '/contracts',
  'contract-comment': '/contracts',
  'seller-question': '',
  'seller-counsel-message': '/counsel',
} as const;

export type DealItemKind =
  | keyof typeof TEAM_TAB
  | keyof typeof COUNSEL_PAGE
  | keyof typeof SELLER_PAGE;

export interface DealItem<Kind extends DealItemKind = DealItemKind> {
  kind: Kind;
  id: string;
}

export function itemAnchor(item: DealItem): string {
  return `${item.kind}-${item.id}`;
}

export function isItemAnchor(anchor: string): boolean {
  return [TEAM_TAB, COUNSEL_PAGE, SELLER_PAGE]
    .flatMap(Object.keys)
    .some((kind) => anchor.startsWith(`${kind}-`));
}

export function teamItemPath(
  accountSlug: string,
  dealId: string,
  item: DealItem<keyof typeof TEAM_TAB>,
): string {
  return `${dealPath(accountSlug, dealId)}${TEAM_TAB[item.kind]}#${itemAnchor(item)}`;
}

export function dataRoomDocumentPath(
  accountSlug: string,
  dealId: string,
  documentId: string,
): string {
  return `/deal-windows/${accountSlug}/${dealId}/data-room/view?doc=${documentId}`;
}

export function counselItemPath(
  dealId: string,
  item: DealItem<keyof typeof COUNSEL_PAGE>,
): string {
  return `/counsel/${dealId}${COUNSEL_PAGE[item.kind]}#${itemAnchor(item)}`;
}

export function sellerItemPath(
  roomId: string,
  item: DealItem<keyof typeof SELLER_PAGE>,
): string {
  return `/seller/rooms/${roomId}${SELLER_PAGE[item.kind]}#${itemAnchor(item)}`;
}

const STAGE_WORKFLOW_IDS: Record<string, string> = {
  loi_accepted: 'deal.loi_accepted',
  pa_accepted: 'deal.apa_accepted',
};

export function routeDealEventNotification(
  event: NotifiableDealEvent,
): string | null {
  switch (event.eventType) {
    case 'offer.submitted':
      return 'deal.offer_submitted';
    case 'offer.accepted':
      return 'deal.offer_accepted';
    case 'deal.resolved':
      return 'deal.resolved';
    case 'dr_document.added':
      return LENDER_ROOM_DOCUMENTS_WORKFLOW_ID;
    case 'contract.version_added':
    case 'contract.version_shown_to_seller_side':
    case 'contract.comment_posted':
    case 'contract.review_requested':
    case 'contract.review_decided':
    case 'contract.signing_overridden':
      return CONTRACT_NEGOTIATION_WORKFLOW_ID;
    case 'seller_counsel_message.posted':
      return SELLER_COUNSEL_MESSAGE_WORKFLOW_ID;
    case 'deal.stage_changed':
      return event.stage ? (STAGE_WORKFLOW_IDS[event.stage] ?? null) : null;
    default:
      return null;
  }
}

export function planDealEventNotifications(
  events: NotifiableDealEvent[],
  cursor: number,
): DealEventNotificationPlan {
  const ordered = [...events].sort((a, b) => a.globalSeq - b.globalSeq);
  const steps: DealEventNotificationStep[] = [];
  let next = cursor;
  for (const event of ordered) {
    if (event.globalSeq <= cursor) {
      continue;
    }
    const workflowId = routeDealEventNotification(event);
    if (workflowId) {
      steps.push({ event, workflowId });
    }
    next = event.globalSeq;
  }
  return { steps, cursor: next };
}
