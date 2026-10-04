import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const insertSpy = vi.fn();
  const updateSpy = vi.fn();
  const deleteSpy = vi.fn();
  const eqSpy = vi.fn();
  const orderSpy = vi.fn();

  function makeBuilder(table: string) {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;

    builder.select = chain;
    builder.single = chain;
    builder.throwOnError = chain;
    builder.eq = (column: string, value: unknown) => {
      eqSpy(table, column, value);
      return builder;
    };
    builder.order = (column: string, options: unknown) => {
      orderSpy(table, column, options);
      return builder;
    };
    builder.insert = (payload: unknown) => {
      insertSpy(table, payload);
      return builder;
    };
    builder.update = (payload: unknown) => {
      updateSpy(table, payload);
      return builder;
    };
    builder.delete = () => {
      deleteSpy(table);
      return builder;
    };
    builder.then = (resolve: (value: unknown) => void) =>
      resolve({ data: [{ id: 'todo-1' }], error: null });

    return builder;
  }

  const from = vi.fn((table: string) => makeBuilder(table));

  return { insertSpy, updateSpy, deleteSpy, eqSpy, orderSpy, from };
});

vi.mock('@odb/next/actions', () => ({
  enhanceAction: (fn: unknown) => fn,
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({ from: mocks.from }),
}));

import { createTodo, deleteTodo, listTodos, toggleTodo } from './todo-actions';

type Action = (
  data: Record<string, unknown>,
  user: { id: string },
) => Promise<unknown>;

const runCreateTodo = createTodo as unknown as Action;
const runToggleTodo = toggleTodo as unknown as Action;
const runDeleteTodo = deleteTodo as unknown as Action;
const runListTodos = listTodos as unknown as Action;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createTodo', () => {
  it('inserts a personal_todo row with the account, deal, and title', async () => {
    await runCreateTodo(
      { account_id: 'account-1', deal_id: 'deal-1', title: 'Call the broker' },
      { id: 'user-1' },
    );

    const [table, payload] = mocks.insertSpy.mock.calls.at(-1) as unknown as [
      string,
      Record<string, unknown>,
    ];

    expect(table).toBe('personal_todo');
    expect(payload).toEqual({
      account_id: 'account-1',
      deal_id: 'deal-1',
      title: 'Call the broker',
    });
  });

  it('inserts a null deal_id for an account-wide todo', async () => {
    await runCreateTodo(
      { account_id: 'account-1', title: 'Plan the week' },
      { id: 'user-1' },
    );

    const [, payload] = mocks.insertSpy.mock.calls.at(-1) as unknown as [
      string,
      Record<string, unknown>,
    ];

    expect(payload).toMatchObject({ deal_id: null, title: 'Plan the week' });
  });
});

describe('toggleTodo', () => {
  it('updates the done flag for the row by id', async () => {
    await runToggleTodo(
      { id: '11111111-1111-4111-8111-111111111111', done: true },
      { id: 'user-1' },
    );

    const [table, payload] = mocks.updateSpy.mock.calls.at(-1) as unknown as [
      string,
      Record<string, unknown>,
    ];

    expect(table).toBe('personal_todo');
    expect(payload).toEqual({ done: true });
    expect(mocks.eqSpy).toHaveBeenCalledWith(
      'personal_todo',
      'id',
      '11111111-1111-4111-8111-111111111111',
    );
  });
});

describe('deleteTodo', () => {
  it('deletes the row by id', async () => {
    await runDeleteTodo(
      { id: '11111111-1111-4111-8111-111111111111' },
      { id: 'user-1' },
    );

    expect(mocks.deleteSpy).toHaveBeenCalledWith('personal_todo');
    expect(mocks.eqSpy).toHaveBeenCalledWith(
      'personal_todo',
      'id',
      '11111111-1111-4111-8111-111111111111',
    );
  });
});

describe('listTodos', () => {
  it('filters by deal when a deal id is given', async () => {
    await runListTodos({ deal_id: 'deal-1' }, { id: 'user-1' });

    expect(mocks.eqSpy).toHaveBeenCalledWith(
      'personal_todo',
      'deal_id',
      'deal-1',
    );
  });

  it('reads every todo for the user when no deal id is given', async () => {
    await runListTodos({}, { id: 'user-1' });

    expect(mocks.eqSpy).not.toHaveBeenCalled();
  });
});
