export const TASK_QUEUE = 'opendealbook';

export const OUTREACH_DISPATCH_SCHEDULE_ID = 'outreach-dispatch';
export const OUTREACH_DISPATCH_WORKFLOW_TYPE = 'outreachDispatch';

export function dealWorkflowId(dealId: string): string {
  return `deal-lifecycle-${dealId}`;
}
