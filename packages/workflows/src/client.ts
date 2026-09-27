import { Client, Connection } from '@temporalio/client';

import { dealWorkflowId, TASK_QUEUE } from './ids';

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
