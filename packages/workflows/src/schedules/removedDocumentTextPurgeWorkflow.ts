import { proxyActivities } from '@temporalio/workflow';

import type * as activities from './removedDocumentTextPurgeActivity';

const { purgeRemovedDocumentText } = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 minutes',
});

export async function purgeRemovedDocumentTextNightly(): Promise<void> {
  await purgeRemovedDocumentText();
}
