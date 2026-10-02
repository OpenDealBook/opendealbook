export const TASK_QUEUE = 'opendealbook';

export const OUTREACH_DISPATCH_SCHEDULE_ID = 'outreach-dispatch';
export const OUTREACH_DISPATCH_WORKFLOW_TYPE = 'outreachDispatch';

export const COMP_EVENT_RELAY_WORKFLOW_ID = 'comp-event-relay';
export const COMP_EVENT_RELAY_WORKFLOW_TYPE = 'compEventRelay';

export function dealWorkflowId(dealId: string): string {
  return `deal-lifecycle-${dealId}`;
}
