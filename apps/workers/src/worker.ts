import { NativeConnection, Worker } from '@temporalio/worker';

import * as activities from '@odb/workflows/activities';
import { TASK_QUEUE } from '@odb/workflows/client';

import { fileURLToPath } from 'node:url';

const address = process.env.TEMPORAL_ADDRESS ?? 'localhost:7233';
const workflowsPath = fileURLToPath(import.meta.resolve('@odb/workflows'));

const connection = await NativeConnection.connect({ address });

const worker = await Worker.create({
  connection,
  namespace: 'default',
  taskQueue: TASK_QUEUE,
  workflowsPath,
  activities,
});

await worker.run();
