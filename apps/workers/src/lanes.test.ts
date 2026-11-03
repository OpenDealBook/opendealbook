import * as workflows from '@odb/workflows';
import { BULK_TASK_QUEUE, TASK_QUEUE } from '@odb/workflows/client';

import { lanesByWorkerQueue } from './lanes.ts';

import assert from 'node:assert/strict';
import { test } from 'node:test';

const exportedEnsureNames = Object.keys(workflows)
  .filter((name) => name.startsWith('ensure'))
  .sort();

const ensureNames = (queue: keyof typeof lanesByWorkerQueue) =>
  lanesByWorkerQueue[queue]
    .flatMap((lane) => lane.ensures)
    .map((ensure) => ensure.name)
    .sort();

const pollers = (queue: keyof typeof lanesByWorkerQueue) =>
  lanesByWorkerQueue[queue].map((lane) => ({
    taskQueue: lane.options.taskQueue,
    maxConcurrentActivityTaskExecutions:
      lane.options.maxConcurrentActivityTaskExecutions,
  }));

test('main polls the main queue with SDK default concurrency and runs every exported ensure', () => {
  assert.deepEqual(pollers('main'), [
    { taskQueue: TASK_QUEUE, maxConcurrentActivityTaskExecutions: undefined },
  ]);
  assert.ok(exportedEnsureNames.length > 0);
  assert.deepEqual(ensureNames('main'), exportedEnsureNames);
});

test('bulk polls the bulk queue with two concurrent activities and runs no ensures', () => {
  assert.deepEqual(pollers('bulk'), [
    { taskQueue: BULK_TASK_QUEUE, maxConcurrentActivityTaskExecutions: 2 },
  ]);
  assert.deepEqual(ensureNames('bulk'), []);
});

test('all polls both queues with their own concurrency and runs every exported ensure once', () => {
  assert.deepEqual(pollers('all'), [
    { taskQueue: TASK_QUEUE, maxConcurrentActivityTaskExecutions: undefined },
    { taskQueue: BULK_TASK_QUEUE, maxConcurrentActivityTaskExecutions: 2 },
  ]);
  assert.deepEqual(ensureNames('all'), exportedEnsureNames);
});
