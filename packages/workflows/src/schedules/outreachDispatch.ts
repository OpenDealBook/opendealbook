import type { Client, ScheduleHandle } from '@temporalio/client';

import {
  OUTREACH_DISPATCH_SCHEDULE_ID,
  OUTREACH_DISPATCH_WORKFLOW_TYPE,
  TASK_QUEUE,
} from '../ids';

// Cold outreach is throttled by a per-account daily cap; running every 30
// minutes spreads each account's sends across the day rather than firing the
// whole cap in one burst.
export async function ensureOutreachDispatchSchedule(
  client: Client,
): Promise<ScheduleHandle> {
  return client.schedule.create({
    scheduleId: OUTREACH_DISPATCH_SCHEDULE_ID,
    spec: {
      intervals: [{ every: '30 minutes' }],
    },
    action: {
      type: 'startWorkflow',
      workflowType: OUTREACH_DISPATCH_WORKFLOW_TYPE,
      taskQueue: TASK_QUEUE,
      args: [],
    },
  });
}

export async function triggerOutreachDispatch(client: Client): Promise<void> {
  await client.schedule.getHandle(OUTREACH_DISPATCH_SCHEDULE_ID).trigger();
}
