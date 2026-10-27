import { proxyActivities, uuid4 } from '@temporalio/workflow';

import type * as activities from '../activities';
import { runScreeningImport } from './importScreeningList';

const { startScreeningImport, failScreeningImport } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: '5 minutes',
  retry: { maximumAttempts: 3 },
});

const { loadLatestScreeningList } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 hour',
  heartbeatTimeout: '2 minutes',
  retry: { maximumAttempts: 3 },
});

export async function importScreeningList(): Promise<void> {
  await runScreeningImport({
    newId: uuid4,
    startScreeningImport,
    loadLatestScreeningList,
    failScreeningImport,
  });
}
