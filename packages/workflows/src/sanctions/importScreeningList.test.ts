import { ActivityFailure, CancelledFailure, RetryState } from '@temporalio/common';

import { describe, expect, it } from 'vitest';

import { runScreeningImport } from './importScreeningList';

function steps(loadFailure: Error) {
  const failed: { importId: string; reason: string }[] = [];
  return {
    failed,
    steps: {
      newId: () => 'import-1',
      startScreeningImport: async () => {},
      loadLatestScreeningList: async () => {
        throw loadFailure;
      },
      failScreeningImport: async (failure: { importId: string; reason: string }) => {
        failed.push(failure);
      },
    },
  };
}

function activityFailure(retryState: RetryState, cause: Error) {
  return new ActivityFailure(
    'Activity task failed',
    'loadLatestScreeningList',
    '1',
    retryState,
    'worker',
    cause,
  );
}

describe('runScreeningImport', () => {
  it('rethrows a cancelled load without marking the import failed', async () => {
    const cancelled = activityFailure(
      RetryState.CANCEL_REQUESTED,
      new CancelledFailure('Activity cancelled'),
    );
    const { failed, steps: run } = steps(cancelled);

    await expect(runScreeningImport(run)).rejects.toBe(cancelled);
    expect(failed).toEqual([]);
  });

  it('rethrows a cancellation raised before the load starts', async () => {
    const cancelled = new CancelledFailure('Workflow cancelled');
    const { failed, steps: run } = steps(cancelled);

    await expect(runScreeningImport(run)).rejects.toBe(cancelled);
    expect(failed).toEqual([]);
  });

  it('records any other failed load with the reason it failed', async () => {
    const { failed, steps: run } = steps(
      activityFailure(
        RetryState.MAXIMUM_ATTEMPTS_REACHED,
        new Error('GET https://data.trade.gov answered 503'),
      ),
    );

    await runScreeningImport(run);

    expect(failed).toEqual([
      { importId: 'import-1', reason: 'GET https://data.trade.gov answered 503' },
    ]);
  });
});
