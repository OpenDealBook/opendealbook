import type { Client } from '@temporalio/client';

import { TASK_QUEUE } from '../ids';
import { ensureSchedule } from './ensureSchedule';

const WORKFLOW_PRUNE_SCHEDULE_ID = 'workflow-step-data-prune';

export function ensureWorkflowPruneSchedule(client: Client): Promise<void> {
  return ensureSchedule(client, {
    scheduleId: WORKFLOW_PRUNE_SCHEDULE_ID,
    spec: { calendars: [{ hour: 3 }] },
    action: {
      type: 'startWorkflow',
      workflowType: 'pruneWorkflowStepDataDaily',
      taskQueue: TASK_QUEUE,
      args: [],
    },
  });
}
