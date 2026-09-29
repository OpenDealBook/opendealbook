import type { Client, ScheduleHandle } from '@temporalio/client';

import { TASK_QUEUE } from '../ids';

export const SBA_REFRESH_SCHEDULE_ID = 'sba-loans-refresh';

// SBA fiscal quarters close Dec 31, Mar 31, Jun 30, Sep 30 and the FOIA files
// publish about a month later, so the run fires on the first of the following
// month: Feb, May, Aug, Nov.
export async function ensureSbaRefreshSchedule(client: Client): Promise<ScheduleHandle> {
  return client.schedule.create({
    scheduleId: SBA_REFRESH_SCHEDULE_ID,
    spec: {
      calendars: [{ month: ['FEBRUARY', 'MAY', 'AUGUST', 'NOVEMBER'], dayOfMonth: 1, hour: 6 }],
    },
    action: {
      type: 'startWorkflow',
      workflowType: 'refreshSbaLoans',
      taskQueue: TASK_QUEUE,
      args: [{}],
    },
  });
}

export async function triggerSbaRefresh(client: Client): Promise<void> {
  await client.schedule.getHandle(SBA_REFRESH_SCHEDULE_ID).trigger();
}
