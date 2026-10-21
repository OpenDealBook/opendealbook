import { proxyActivities } from '@temporalio/workflow';

import type * as activities from '../activities';

const { notifyOverdueMilestones } = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 minutes',
});

export async function notifyOverdueMilestonesDaily(): Promise<void> {
  await notifyOverdueMilestones(new Date().toISOString().slice(0, 10));
}
