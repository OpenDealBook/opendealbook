import type { Client } from '@temporalio/client';

import { TASK_QUEUE } from '../ids';
import { ensureSchedule } from './ensureSchedule';

export function ensureOrphanDealFileSweepSchedule(client: Client): Promise<void> {
  return ensureSchedule(client, {
    scheduleId: 'orphan-deal-file-sweep',
    spec: { calendars: [{ hour: 5 }] },
    action: {
      type: 'startWorkflow',
      workflowType: 'sweepOrphanedDealObjects',
      taskQueue: TASK_QUEUE,
      args: [],
    },
  });
}
