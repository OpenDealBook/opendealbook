import { NativeConnection, Worker } from '@temporalio/worker';

import {
  ensureCompEventRelay,
  ensureDealEventNotificationRelay,
} from '@odb/workflows';
import * as activities from '@odb/workflows/activities';
import { getTemporalClient, TASK_QUEUE } from '@odb/workflows/client';

import { env } from './env.ts';

import { fileURLToPath } from 'node:url';

const workflowsPath = fileURLToPath(import.meta.resolve('@odb/workflows'));

const connection = await NativeConnection.connect({
  address: env.TEMPORAL_ADDRESS,
});

const worker = await Worker.create({
  connection,
  namespace: 'default',
  taskQueue: TASK_QUEUE,
  workflowsPath,
  activities,
});

const client = await getTemporalClient();

for (const ensure of [ensureCompEventRelay, ensureDealEventNotificationRelay]) {
  try {
    await ensure(client);
  } catch (error) {
    console.error(`relay ensure failed: ${ensure.name}`, error);
  }
}

await worker.run();
