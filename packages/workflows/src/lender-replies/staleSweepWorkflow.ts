import { proxyActivities } from '@temporalio/workflow';

import type * as activities from '../activities';

const { failStaleSendingOutreach } = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes',
});

export async function sweepStaleLenderOutreach(): Promise<void> {
  await failStaleSendingOutreach();
}
