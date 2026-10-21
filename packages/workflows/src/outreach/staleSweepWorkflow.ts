import { proxyActivities } from '@temporalio/workflow';

import type * as activities from '../activities';

const { failStaleSendingOutreachMessages } = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes',
});

export async function sweepStaleOutreachMessages(): Promise<void> {
  await failStaleSendingOutreachMessages();
}
