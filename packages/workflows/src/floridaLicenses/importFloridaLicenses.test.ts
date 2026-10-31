import { ActivityFailure, CancelledFailure, RetryState } from '@temporalio/common';

import { describe, expect, it } from 'vitest';

import { runFloridaLicenseImport } from './importFloridaLicenses';

function steps(loadFailure: Error | null) {
  const started: string[] = [];
  const loaded: string[] = [];
  const failed: { importId: string; reason: string }[] = [];
  return {
    started,
    loaded,
    failed,
    steps: {
      newId: () => 'import-1',
      startFloridaLicenseImport: async ({ importId }: { importId: string }) => {
        started.push(importId);
      },
      loadFloridaLicenses: async ({ importId }: { importId: string }) => {
        if (loadFailure) {
          throw loadFailure;
        }
        loaded.push(importId);
      },
      failFloridaLicenseImport: async (failure: { importId: string; reason: string }) => {
        failed.push(failure);
      },
    },
  };
}

describe('runFloridaLicenseImport', () => {
  it('starts one import and loads the files into it', async () => {
    const run = steps(null);

    await runFloridaLicenseImport(run.steps);

    expect(run.started).toEqual(['import-1']);
    expect(run.loaded).toEqual(['import-1']);
    expect(run.failed).toEqual([]);
  });

  it('rethrows a cancellation without marking the import failed', async () => {
    const cancelled = new CancelledFailure('Workflow cancelled');
    const run = steps(cancelled);

    await expect(runFloridaLicenseImport(run.steps)).rejects.toBe(cancelled);
    expect(run.failed).toEqual([]);
  });

  it('records any other failed load with the reason it failed', async () => {
    const run = steps(
      new ActivityFailure(
        'Activity task failed',
        'loadFloridaLicenses',
        '1',
        RetryState.MAXIMUM_ATTEMPTS_REACHED,
        'worker',
        new Error('GET https://www2.myfloridalicense.com answered 503'),
      ),
    );

    await runFloridaLicenseImport(run.steps);

    expect(run.failed).toEqual([{ importId: 'import-1', reason: 'GET https://www2.myfloridalicense.com answered 503' }]);
  });
});
