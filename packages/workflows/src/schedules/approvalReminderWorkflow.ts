import { proxyActivities } from '@temporalio/workflow';

import type * as activities from './approvalReminderActivity';

const { remindWaitingApprovals } = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 minutes',
});

export async function sendApprovalReminders(): Promise<void> {
  await remindWaitingApprovals();
}
