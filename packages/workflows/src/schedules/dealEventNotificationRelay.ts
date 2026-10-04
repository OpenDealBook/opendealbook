import type { Client, WorkflowHandle } from '@temporalio/client';

import {
  DEAL_EVENT_NOTIFICATION_RELAY_WORKFLOW_ID,
  DEAL_EVENT_NOTIFICATION_RELAY_WORKFLOW_TYPE,
  TASK_QUEUE,
} from '../ids';

// The relay is a single long-running workflow that carries its global_seq cursor
// across continue-as-new rather than a cron schedule. USE_EXISTING keeps a repeat
// start idempotent: the one instance is reused rather than a second one started.
export async function ensureDealEventNotificationRelay(
  client: Client,
): Promise<WorkflowHandle> {
  return client.workflow.start(DEAL_EVENT_NOTIFICATION_RELAY_WORKFLOW_TYPE, {
    taskQueue: TASK_QUEUE,
    workflowId: DEAL_EVENT_NOTIFICATION_RELAY_WORKFLOW_ID,
    workflowIdConflictPolicy: 'USE_EXISTING',
    args: [{}],
  });
}
