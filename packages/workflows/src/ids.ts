export const TASK_QUEUE = 'opendealbook';

export const OUTREACH_DISPATCH_SCHEDULE_ID = 'outreach-dispatch';
export const OUTREACH_DISPATCH_WORKFLOW_TYPE = 'outreachDispatch';

export const COMP_EVENT_RELAY_WORKFLOW_ID = 'comp-event-relay';
export const COMP_EVENT_RELAY_WORKFLOW_TYPE = 'compEventRelay';

export const DEAL_EVENT_NOTIFICATION_RELAY_WORKFLOW_ID =
  'deal-event-notification-relay';
export const DEAL_EVENT_NOTIFICATION_RELAY_WORKFLOW_TYPE =
  'dealEventNotificationRelay';

export const TRIAL_DRIP_WORKFLOW_TYPE = 'trialDrip';

export function dealWorkflowId(dealId: string): string {
  return `deal-lifecycle-${dealId}`;
}

export function trialDripWorkflowId(userId: string): string {
  return `trial-drip-${userId}`;
}
