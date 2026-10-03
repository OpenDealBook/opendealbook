import { Client, Connection } from '@temporalio/client';

import {
  dealWorkflowId,
  TASK_QUEUE,
  TRIAL_DRIP_WORKFLOW_TYPE,
  trialDripWorkflowId,
} from './ids';
import type { TrialDripInput } from './workflows/trialDrip';

export { dealWorkflowId, TASK_QUEUE } from './ids';

export interface DealContext {
  accountId: string;
  actorUserId: string;
}

export async function getTemporalClient(): Promise<Client> {
  const connection = await Connection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233',
  });

  return new Client({ connection });
}

export async function startDealLifecycle(dealId: string, context: DealContext) {
  const client = await getTemporalClient();

  return client.workflow.start('dealLifecycle', {
    taskQueue: TASK_QUEUE,
    workflowId: dealWorkflowId(dealId),
    args: [
      {
        dealId,
        accountId: context.accountId,
        actorUserId: context.actorUserId,
      },
    ],
  });
}

export async function signalDeal(
  dealId: string,
  signal: string,
  payload: unknown,
): Promise<void> {
  const client = await getTemporalClient();
  const handle = client.workflow.getHandle(dealWorkflowId(dealId));

  await handle.signal(signal, payload);
}

export async function startTrialDrip(input: TrialDripInput) {
  const client = await getTemporalClient();

  return client.workflow.start(TRIAL_DRIP_WORKFLOW_TYPE, {
    taskQueue: TASK_QUEUE,
    workflowId: trialDripWorkflowId(input.userId),
    workflowIdConflictPolicy: 'USE_EXISTING',
    args: [input],
  });
}

export async function stopTrialDrip(userId: string): Promise<void> {
  const client = await getTemporalClient();
  const handle = client.workflow.getHandle(trialDripWorkflowId(userId));

  await handle.signal('stopTrialDrip');
}
