import { proxyActivities } from '@temporalio/workflow';

import type * as activities from './workflowPruneActivity';

const { pruneWorkflowStepData } = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 minutes',
});

export async function pruneWorkflowStepDataDaily(): Promise<void> {
  await pruneWorkflowStepData();
}
