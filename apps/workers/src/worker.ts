import {
  bundleWorkflowCode,
  NativeConnection,
  Worker,
} from '@temporalio/worker';

import * as activities from '@odb/workflows/activities';
import { getTemporalClient } from '@odb/workflows/client';

import { env } from './env.ts';
import { lanesByWorkerQueue } from './lanes.ts';

import { fileURLToPath } from 'node:url';

const workflowBundle = await bundleWorkflowCode({
  workflowsPath: fileURLToPath(
    new URL('./workflows/index.ts', import.meta.resolve('@odb/workflows')),
  ),
});

const connection = await NativeConnection.connect({
  address: env.TEMPORAL_ADDRESS,
});

const lanes = lanesByWorkerQueue[env.WORKER_QUEUE];

const workers = await Promise.all(
  lanes.map((lane) =>
    Worker.create({
      connection,
      namespace: 'default',
      workflowBundle,
      activities,
      ...lane.options,
    }),
  ),
);

const client = await getTemporalClient();

for (const ensure of lanes.flatMap((lane) => lane.ensures)) {
  try {
    await ensure(client);
  } catch (error) {
    console.error(`relay ensure failed: ${ensure.name}`, error);
  }
}

await Promise.all(workers.map((worker) => worker.run()));
