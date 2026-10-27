import type { Client } from '@temporalio/client';

import { TASK_QUEUE } from '../ids';
import { ensureSchedule } from '../schedules/ensureSchedule';

export function ensureOutreachReplySyncSchedule(client: Client): Promise<void> {
  return ensureSchedule(client, {
    scheduleId: 'outreach-reply-sync',
    spec: { intervals: [{ every: '1h' }] },
    action: {
      type: 'startWorkflow',
      workflowType: 'syncOutreachRepliesHourly',
      taskQueue: TASK_QUEUE,
      args: [],
    },
  });
}
