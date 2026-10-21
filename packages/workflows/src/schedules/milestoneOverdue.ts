import type { Client } from '@temporalio/client';

import { TASK_QUEUE } from '../ids';
import { ensureSchedule } from './ensureSchedule';

const MILESTONE_OVERDUE_SCHEDULE_ID = 'milestone-overdue-notice';

export function ensureMilestoneOverdueSchedule(
  client: Client,
): Promise<void> {
  return ensureSchedule(client, {
    scheduleId: MILESTONE_OVERDUE_SCHEDULE_ID,
    spec: { calendars: [{ hour: 13 }] },
    action: {
      type: 'startWorkflow',
      workflowType: 'notifyOverdueMilestonesDaily',
      taskQueue: TASK_QUEUE,
      args: [],
    },
  });
}
