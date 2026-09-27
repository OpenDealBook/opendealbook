import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const insertSpy = vi.fn();
  const updateSpy = vi.fn();

  function makeBuilder(table: string) {
    const builder: Record<string, unknown> = {};

    builder.select = () => builder;
    builder.eq = () => builder;
    builder.order = () => builder;
    builder.limit = () => builder;
    builder.insert = (payload: unknown) => {
      insertSpy(table, payload);
      return builder;
    };
    builder.update = (payload: unknown) => {
      updateSpy(table, payload);
      return builder;
    };
    builder.maybeSingle = () =>
      Promise.resolve({
        data: table === 'deal_box' ? { version: 3 } : null,
        error: null,
      });
    builder.single = () =>
      Promise.resolve({ data: { id: `${table}-1` }, error: null });
    builder.throwOnError = () => Promise.resolve({ data: null, error: null });

    return builder;
  }

  const from = vi.fn((table: string) => makeBuilder(table));

  return { insertSpy, updateSpy, from };
});

vi.mock('@tuckin/next/actions', () => ({
  enhanceAction: (fn: unknown) => fn,
}));

vi.mock('@tuckin/supabase/server', () => ({
  getSupabaseServerClient: () => ({ from: mocks.from }),
}));

import { createDeal, updateChecklistItemStatus } from './deal-actions';

const runCreateDeal = createDeal as unknown as (
  data: Record<string, unknown>,
  user: { id: string },
) => Promise<unknown>;

const runUpdateChecklistItemStatus = updateChecklistItemStatus as unknown as (
  data: Record<string, unknown>,
  user: { id: string },
) => Promise<unknown>;

describe('createDeal', () => {
  it('stamps account_id, owner_user_id and the current deal_box version', async () => {
    await runCreateDeal(
      { account_id: 'account-1', source: 'manual', stage: 'pre_nda' },
      { id: 'user-1' },
    );

    const dealInsert = mocks.insertSpy.mock.calls.find(
      ([table]) => table === 'deal',
    );

    expect(dealInsert?.[1]).toMatchObject({
      account_id: 'account-1',
      owner_user_id: 'user-1',
      deal_box_version: 3,
    });
  });
});

describe('updateChecklistItemStatus', () => {
  it('sets received_at when transitioning to received', async () => {
    await runUpdateChecklistItemStatus(
      { id: 'item-1', status: 'received' },
      { id: 'user-1' },
    );

    const [, payload] = mocks.updateSpy.mock.calls.at(-1) as [
      string,
      Record<string, unknown>,
    ];

    expect(payload.status).toBe('received');
    expect(payload.received_at).toBeTruthy();
    expect(payload.reviewed_at).toBeUndefined();
  });
});
