import type { Client } from '@temporalio/client';

import { TASK_QUEUE } from '../ids';
import { ensureSchedule } from '../schedules/ensureSchedule';

const LENDER_OUTREACH_STALE_SWEEP_SCHEDULE_ID = 'lender-outreach-stale-sweep';

export function ensureLenderOutreachStaleSweepSchedule(
  client: Client,
): Promise<void> {
  return ensureSchedule(client, {
    scheduleId: LENDER_OUTREACH_STALE_SWEEP_SCHEDULE_ID,
    spec: { intervals: [{ every: '15m' }] },
    action: {
      type: 'startWorkflow',
      workflowType: 'sweepStaleLenderOutreach',
      taskQueue: TASK_QUEUE,
      args: [],
    },
  });
}
