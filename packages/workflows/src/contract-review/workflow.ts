import { proxyActivities } from '@temporalio/workflow';

import type * as activities from '../activities';

const { syncContractReviewTodosForTeams, emailContractReviewRemindersDue } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: '30 minutes',
  });

export async function syncContractReviewTodosHourly(): Promise<void> {
  await syncContractReviewTodosForTeams();
}

export async function emailContractReviewRemindersHourly(): Promise<void> {
  await emailContractReviewRemindersDue(new Date().toISOString());
}
