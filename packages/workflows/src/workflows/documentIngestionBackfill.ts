import { proxyActivities } from '@temporalio/workflow';

import type * as activities from '../activities';

const { startMissingDocumentIngestions } = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 minutes',
  heartbeatTimeout: '2 minutes',
});

export async function documentIngestionBackfill(input: {
  accountId?: string;
}): Promise<void> {
  await startMissingDocumentIngestions(input);
}
