import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  provisionAccount,
  seedDeal,
  type IntegrationAccount,
} from '../../../test-support/integration-harness';
import { createTodo } from './createTodo';

let owner: IntegrationAccount;
let manager: IntegrationAccount;
let member: IntegrationAccount;
let outsider: IntegrationAccount;
let teamId: string;
let dealId: string;
let otherTeamDealId: string;

beforeAll(async () => {
  [owner, manager, member, outsider] = await Promise.all([
    provisionAccount(),
    provisionAccount(),
    provisionAccount(),
    provisionAccount(),
  ]);
  teamId = owner.accountId;
  await owner.admin
    .from('accounts_memberships')
    .insert([
      { account_id: teamId, user_id: manager.userId, account_role: 'admin' },
      { account_id: teamId, user_id: member.userId, account_role: 'member' },
    ])
    .throwOnError();
  await owner.admin
    .from('accounts_memberships')
    .update({ account_role: 'member' })
    .eq('account_id', teamId)
    .eq('user_id', owner.userId)
    .throwOnError();
  dealId = await seedDeal(owner.admin, teamId, manager.userId, { description: 'Main St Bakery' });
  otherTeamDealId = await seedDeal(outsider.admin, outsider.accountId, outsider.userId, {
    description: 'Elsewhere Deli',
  });
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await owner.admin.from('accounts').delete().in('id', [teamId, outsider.accountId]);
  await Promise.all([owner, manager, member, outsider].map((account) => account.cleanup()));
});

function context(idempotencyKey: string) {
  return { accountId: teamId, runId: 'run-1', idempotencyKey };
}

async function todosOf(ids: string[]) {
  const { data } = await owner.admin
    .from('personal_todo')
    .select('id, user_id, title, deal_id, due_at, account_id')
    .in('id', ids)
    .throwOnError();
  return data;
}

async function todosTitled(title: string) {
  const { data } = await owner.admin
    .from('personal_todo')
    .select('id')
    .eq('account_id', teamId)
    .eq('title', title)
    .throwOnError();
  return data;
}

describe('create_todo step (integration)', () => {
  it("gives each named member a to-do with the title, deal and a due date counted from the team's local today", async () => {
    await owner.admin
      .from('accounts')
      .update({ timezone: 'Pacific/Auckland' })
      .eq('id', teamId)
      .throwOnError();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-21T23:30:00Z'));

    const output = await createTodo.execute({
      context: context(`${crypto.randomUUID()}:todo:0`),
      config: {
        title: 'Call the lender',
        assignees: { kind: 'members', userIds: [member.userId, manager.userId] },
        dueInDays: 3,
        dealId,
      },
      input: {},
    });

    const todos = await todosOf(output.todoIds as string[]);
    expect(todos).toHaveLength(2);
    expect(todos.map((todo) => todo.user_id).sort()).toEqual(
      [member.userId, manager.userId].sort(),
    );
    for (const todo of todos) {
      expect(todo).toMatchObject({
        account_id: teamId,
        title: 'Call the lender',
        deal_id: dealId,
        due_at: '2026-10-25T00:00:00+00:00',
      });
    }
  });

  it('leaves the due date and deal empty when the config names neither', async () => {
    const output = await createTodo.execute({
      context: context(`${crypto.randomUUID()}:todo:0`),
      config: { title: 'Plain to-do', assignees: { kind: 'members', userIds: [member.userId] } },
      input: {},
    });

    expect(await todosOf(output.todoIds as string[])).toEqual([
      expect.objectContaining({ user_id: member.userId, deal_id: null, due_at: null }),
    ]);
  });

  it.each([
    ['without a deal', {}],
    ['for a deal', { dealIdOf: () => dealId }],
  ])(
    'assigns only the members who manage deals %s, leaving out a primary owner whose role does not',
    async (_, { dealIdOf }: { dealIdOf?: () => string }) => {
      const output = await createTodo.execute({
        context: context(`${crypto.randomUUID()}:todo:0`),
        config: {
          title: 'Review the LOI',
          assignees: { kind: 'deal_managers' },
          ...(dealIdOf && { dealId: dealIdOf() }),
        },
        input: {},
      });

      const todos = await todosOf(output.todoIds as string[]);
      expect(todos.map((todo) => todo.user_id)).toEqual([manager.userId]);
    },
  );

  it('fails at once when the team has no deal managers to assign', async () => {
    await owner.admin
      .from('accounts_memberships')
      .update({ account_role: 'member' })
      .eq('account_id', outsider.accountId)
      .throwOnError();

    const failure = await createTodo
      .execute({
        context: { accountId: outsider.accountId, runId: 'run-1', idempotencyKey: 'run-1:todo:0' },
        config: { title: 'Review the LOI', assignees: { kind: 'deal_managers' } },
        input: {},
      })
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({
      nonRetryable: true,
      message: 'This team has no deal managers to assign',
    });
  });

  it('accepts a member id written in uppercase', async () => {
    const output = await createTodo.execute({
      context: context(`${crypto.randomUUID()}:todo:0`),
      config: {
        title: 'Uppercase id',
        assignees: { kind: 'members', userIds: [member.userId.toUpperCase()] },
      },
      input: {},
    });

    expect(await todosOf(output.todoIds as string[])).toEqual([
      expect.objectContaining({ user_id: member.userId }),
    ]);
  });

  it('makes no second to-do when the step is retried', async () => {
    const title = `Retry ${crypto.randomUUID()}`;
    const args = {
      context: context(`${crypto.randomUUID()}:todo:0`),
      config: { title, assignees: { kind: 'members', userIds: [member.userId] } },
      input: {},
    };

    const first = await createTodo.execute(args);
    const second = await createTodo.execute(args);

    expect(second).toEqual(first);
    expect(await todosTitled(title)).toHaveLength(1);
  });

  async function attempt(config: Record<string, unknown>) {
    const title = `Refused ${crypto.randomUUID()}`;
    const failure = await createTodo
      .execute({
        context: context(`${crypto.randomUUID()}:todo:0`),
        config: { title, ...config },
        input: {},
      })
      .catch((error: unknown) => error);
    return { failure, todos: await todosTitled(title) };
  }

  it.each([
    ['who was never on the team', () => outsider.userId],
    ['with no account', () => crypto.randomUUID()],
    ['whose id is not a uuid', () => 'not-a-uuid'],
  ])(
    'fails at once without a to-do, naming no one, for an assignee %s',
    async (_, assigneeOf) => {
      await owner.admin
        .from('accounts')
        .update({ name: 'Dana Whitfield' })
        .eq('id', outsider.userId)
        .throwOnError();

      const { failure, todos } = await attempt({
        assignees: { kind: 'members', userIds: [member.userId, assigneeOf()] },
      });

      expect(failure).toMatchObject({
        nonRetryable: true,
        message: 'Someone in this step is not on this team',
      });
      expect(todos).toEqual([]);
    },
  );

  it.each([
    ["another team's deal", () => otherTeamDealId],
    ['a deal id that is not a uuid', () => 'not-a-uuid'],
  ])('fails at once without a to-do for %s', async (_, dealIdOf) => {
    const { failure, todos } = await attempt({
      assignees: { kind: 'members', userIds: [member.userId] },
      dealId: dealIdOf(),
    });

    expect(failure).toMatchObject({
      nonRetryable: true,
      message: 'That deal is not on this team',
    });
    expect(todos).toEqual([]);
  });
});
