import { proxyActivities } from '@temporalio/workflow';

import type * as activities from '../activities';

const { syncLenderNudgeTodos, emailLendersToNudgeDue } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: '30 minutes',
});

export async function syncLenderNudgeTodosHourly(): Promise<void> {
  await syncLenderNudgeTodos();
}

export async function emailLendersToNudgeHourly(): Promise<void> {
  await emailLendersToNudgeDue(new Date().toISOString());
}
