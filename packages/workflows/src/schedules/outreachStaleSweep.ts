import type { Client } from '@temporalio/client';

import { TASK_QUEUE } from '../ids';
import { ensureSchedule } from './ensureSchedule';

export function ensureOutreachStaleSweepSchedule(client: Client): Promise<void> {
  return ensureSchedule(client, {
    scheduleId: 'outreach-stale-sweep',
    spec: { intervals: [{ every: '15m' }] },
    action: {
      type: 'startWorkflow',
      workflowType: 'sweepStaleOutreachMessages',
      taskQueue: TASK_QUEUE,
      args: [],
    },
  });
}
