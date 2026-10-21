import { proxyActivities } from '@temporalio/workflow';

import type * as activities from '../activities';

const { deleteUnfinishedUploads } = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 minutes',
});

export async function cleanUpUnfinishedUploads(): Promise<void> {
  await deleteUnfinishedUploads();
}
