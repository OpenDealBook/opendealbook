import { describe, expect, it } from 'vitest';

import { approval } from './approval';

const context = {
  accountId: 'team-1',
  runId: 'run-1',
  idempotencyKey: 'run-1:approve:0',
};

describe('approval step', () => {
  it('shows the prompt a deal manager decides on', async () => {
    const output = await approval.execute({
      context,
      config: { prompt: 'Send the LOI to Acme Plumbing?' },
      input: {},
    });

    expect(output).toEqual({ prompt: 'Send the LOI to Acme Plumbing?' });
  });

  it('refuses, without retries, a step with no prompt', async () => {
    const failure = await approval
      .execute({ context, config: { prompt: '' }, input: {} })
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({
      nonRetryable: true,
      message: expect.stringContaining('prompt'),
    });
  });
});
