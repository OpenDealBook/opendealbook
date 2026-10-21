import type { Client } from '@temporalio/client';

import { TASK_QUEUE } from '../ids';
import { ensureSchedule } from '../schedules/ensureSchedule';

function ensureHourly(
  client: Client,
  scheduleId: string,
  workflowType: string,
): Promise<void> {
  return ensureSchedule(client, {
    scheduleId,
    spec: { intervals: [{ every: '1h' }] },
    action: {
      type: 'startWorkflow',
      workflowType,
      taskQueue: TASK_QUEUE,
      args: [],
    },
  });
}

export function ensureContractReviewTodoSyncSchedule(client: Client) {
  return ensureHourly(client, 'contract-review-todo-sync', 'syncContractReviewTodosHourly');
}

export function ensureContractReviewReminderEmailSchedule(client: Client) {
  return ensureHourly(client, 'contract-review-daily-reminder', 'emailContractReviewRemindersHourly');
}
