import { proxyActivities } from '@temporalio/workflow';

import type * as activities from '../activities';

const { deleteOrphanedDealObjects } = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 minutes',
});

export async function sweepOrphanedDealObjects(): Promise<void> {
  await deleteOrphanedDealObjects();
}
