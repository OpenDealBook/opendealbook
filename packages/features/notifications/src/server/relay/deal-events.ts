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

const STAGE_WORKFLOW_IDS: Record<string, string> = {
  loi_accepted: 'deal.loi_accepted',
  pa_accepted: 'deal.apa_accepted',
};

export function routeDealEventNotification(event: NotifiableDealEvent): string | null {
  switch (event.eventType) {
    case 'offer.submitted':
      return 'deal.offer_submitted';
    case 'offer.accepted':
      return 'deal.offer_accepted';
    case 'deal.resolved':
      return 'deal.resolved';
    case 'deal.stage_changed':
      return event.stage ? STAGE_WORKFLOW_IDS[event.stage] ?? null : null;
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
