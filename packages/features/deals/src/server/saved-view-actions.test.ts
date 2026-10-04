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
      resolve({ data: { id: 'view-1' }, error: null });

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

import {
  deleteSavedView,
  listSavedViews,
  saveView,
  updateSavedView,
} from './saved-view-actions';

type Action = (
  data: Record<string, unknown>,
  user: { id: string },
) => Promise<unknown>;

const runSaveView = saveView as unknown as Action;
const runListSavedViews = listSavedViews as unknown as Action;
const runUpdateSavedView = updateSavedView as unknown as Action;
const runDeleteSavedView = deleteSavedView as unknown as Action;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('saveView', () => {
  it('inserts a saved_view row carrying the name, filters, sort, and visible columns', async () => {
    await runSaveView(
      {
        account_id: 'account-1',
        name: 'Hot deals',
        filters: { stage: ['loi'], starred: true },
        sort: 'asking_price',
        visible_columns: ['stage', 'asking'],
      },
      { id: 'user-1' },
    );

    const [table, payload] = mocks.insertSpy.mock.calls.at(-1) as unknown as [
      string,
      Record<string, unknown>,
    ];

    expect(table).toBe('saved_view');
    expect(payload).toEqual({
      account_id: 'account-1',
      name: 'Hot deals',
      filters: { stage: ['loi'], starred: true },
      sort: 'asking_price',
      visible_columns: ['stage', 'asking'],
    });
  });
});

describe('listSavedViews', () => {
  it('reads the saved views scoped to the account', async () => {
    await runListSavedViews({ account_id: 'account-1' }, { id: 'user-1' });

    expect(mocks.eqSpy).toHaveBeenCalledWith(
      'saved_view',
      'account_id',
      'account-1',
    );
  });
});

describe('updateSavedView', () => {
  it('updates the named view by id with the new filters, sort, and columns', async () => {
    await runUpdateSavedView(
      {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Renamed',
        filters: { archived: true },
        sort: 'revenue',
        visible_columns: ['revenue'],
      },
      { id: 'user-1' },
    );

    const [table, payload] = mocks.updateSpy.mock.calls.at(-1) as unknown as [
      string,
      Record<string, unknown>,
    ];

    expect(table).toBe('saved_view');
    expect(payload).toEqual({
      name: 'Renamed',
      filters: { archived: true },
      sort: 'revenue',
      visible_columns: ['revenue'],
    });
    expect(mocks.eqSpy).toHaveBeenCalledWith(
      'saved_view',
      'id',
      '11111111-1111-4111-8111-111111111111',
    );
  });
});

describe('deleteSavedView', () => {
  it('deletes the view by id', async () => {
    await runDeleteSavedView(
      { id: '11111111-1111-4111-8111-111111111111' },
      { id: 'user-1' },
    );

    expect(mocks.deleteSpy).toHaveBeenCalledWith('saved_view');
    expect(mocks.eqSpy).toHaveBeenCalledWith(
      'saved_view',
      'id',
      '11111111-1111-4111-8111-111111111111',
    );
  });
});
