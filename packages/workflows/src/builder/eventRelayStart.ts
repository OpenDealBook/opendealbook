import type { Client, WorkflowHandle } from '@temporalio/client';

import { TASK_QUEUE } from '../ids';
import type { EventLogName } from './client';

export const WORKFLOW_EVENT_RELAY_WORKFLOW_ID = 'workflow-event-relay';

export const EVENT_LOGS = ['deal', 'account'] as const satisfies EventLogName[];

export function eventRelayCursorName(log: EventLogName): string {
  return `${WORKFLOW_EVENT_RELAY_WORKFLOW_ID}:${log}`;
}

export async function ensureWorkflowEventRelay(client: Client): Promise<WorkflowHandle> {
  return client.workflow.start('workflowEventRelay', {
    taskQueue: TASK_QUEUE,
    workflowId: WORKFLOW_EVENT_RELAY_WORKFLOW_ID,
    workflowIdConflictPolicy: 'USE_EXISTING',
    args: [{}],
  });
}
