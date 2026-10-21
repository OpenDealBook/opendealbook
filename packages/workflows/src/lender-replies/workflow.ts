import { proxyActivities } from '@temporalio/workflow';

import type * as activities from '../activities';

const { syncLenderReplies } = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 minutes',
});

export async function syncLenderRepliesHourly(): Promise<void> {
  await syncLenderReplies();
}
