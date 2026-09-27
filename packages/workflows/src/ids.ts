export const TASK_QUEUE = 'opendealbook';

export function dealWorkflowId(dealId: string): string {
  return `deal-lifecycle-${dealId}`;
}
