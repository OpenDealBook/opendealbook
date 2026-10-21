import { describe, expect, it } from 'vitest';

import { createTodo } from './createTodo';

const context = { accountId: 'team-1', runId: 'run-1', idempotencyKey: 'run-1:todo:0' };

describe('create_todo step', () => {
  it('refuses, without retries, a config that names no members', async () => {
    const failure = await createTodo
      .execute({
        context,
        config: { title: 'Call the lender', assignees: { kind: 'members', userIds: [] } },
        input: {},
      })
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({
      nonRetryable: true,
      message: expect.stringContaining('userIds'),
    });
  });
});
