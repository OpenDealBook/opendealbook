import { ApplicationFailure } from '@temporalio/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { defineStep } from './step';

const context = { accountId: 'team-1', runId: 'run-1', idempotencyKey: 'run-1:send:0' };

function failingStep(runOnce: boolean) {
  return defineStep({
    type: 'notify_team',
    runOnce,
    configSchema: z.object({}),
    inputSchema: z.object({}),
    outputSchema: z.object({}),
    async run() {
      throw new Error('provider rejected the send');
    },
  });
}

describe('a failing step', () => {
  it('declared run once fails without retries', async () => {
    const failure = await failingStep(true)
      .execute({ context, config: {}, input: {} })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApplicationFailure);
    expect(failure).toMatchObject({
      nonRetryable: true,
      message: 'provider rejected the send',
    });
  });

  it('not declared run once leaves the failure retryable', async () => {
    const failure = await failingStep(false)
      .execute({ context, config: {}, input: {} })
      .catch((error: unknown) => error);

    expect(failure).not.toBeInstanceOf(ApplicationFailure);
    expect(failure).toMatchObject({ message: 'provider rejected the send' });
  });
});
