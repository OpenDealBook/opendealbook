import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const eqSpy = vi.fn();
  let rows: Array<{ id: string }> = [];

  const from = vi.fn(() => {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = chain;
    builder.order = chain;
    builder.limit = chain;
    builder.gt = chain;
    builder.eq = (column: string, value: unknown) => {
      eqSpy(column, value);
      return builder;
    };
    builder.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
    builder.then = (resolve: (value: unknown) => void) =>
      resolve({ data: rows, error: null });
    return builder;
  });

  return {
    from,
    eqSpy,
    setRows: (value: Array<{ id: string }>) => {
      rows = value;
    },
  };
});

vi.mock('@tuckin/supabase/server', () => ({
  getSupabaseServerAdminClient: () => ({ from: mocks.from }),
}));

import { listChecklistItems, listDeals } from './queries';

describe('queries', () => {
  beforeEach(() => {
    mocks.eqSpy.mockClear();
    mocks.setRows([]);
  });

  it('scopes listDeals by account_id', async () => {
    await listDeals('account-1');

    expect(mocks.eqSpy).toHaveBeenCalledWith('account_id', 'account-1');
  });

  it('returns a next cursor when a full page is returned', async () => {
    mocks.setRows([{ id: 'a' }, { id: 'b' }]);

    const page = await listChecklistItems('account-1', 'deal-1', { limit: 2 });

    expect(page.nextCursor).toBe('b');
    expect(mocks.eqSpy).toHaveBeenCalledWith('account_id', 'account-1');
    expect(mocks.eqSpy).toHaveBeenCalledWith('deal_id', 'deal-1');
  });
});
