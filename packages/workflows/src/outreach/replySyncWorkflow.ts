import { proxyActivities } from '@temporalio/workflow';

import type * as activities from '../activities';

const { syncOutreachReplies } = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 minutes',
  retry: { maximumAttempts: 3 },
});

export async function syncOutreachRepliesHourly(): Promise<void> {
  await syncOutreachReplies();
}
