import type { Client } from '@temporalio/client';

import { TASK_QUEUE } from '../ids';
import { ensureSchedule } from '../schedules/ensureSchedule';

const LENDER_REPLY_SYNC_SCHEDULE_ID = 'lender-reply-sync';

export function ensureLenderReplySyncSchedule(
  client: Client,
): Promise<void> {
  return ensureSchedule(client, {
    scheduleId: LENDER_REPLY_SYNC_SCHEDULE_ID,
    spec: { intervals: [{ every: '1h' }] },
    action: {
      type: 'startWorkflow',
      workflowType: 'syncLenderRepliesHourly',
      taskQueue: TASK_QUEUE,
      args: [],
    },
  });
}
