import type { Client } from '@temporalio/client';

import { TASK_QUEUE } from '../ids';
import { ensureSchedule } from './ensureSchedule';

const APPROVAL_REMINDER_SCHEDULE_ID = 'workflow-approval-reminder';

export function ensureApprovalReminderSchedule(client: Client): Promise<void> {
  return ensureSchedule(client, {
    scheduleId: APPROVAL_REMINDER_SCHEDULE_ID,
    spec: { intervals: [{ every: '1h' }] },
    action: {
      type: 'startWorkflow',
      workflowType: 'sendApprovalReminders',
      taskQueue: TASK_QUEUE,
      args: [],
    },
  });
}
