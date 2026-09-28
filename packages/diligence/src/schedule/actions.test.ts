import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const eqSpy = vi.fn();
  const inSpy = vi.fn();
  const updateSpy = vi.fn();

  function dataFor(table: string): unknown {
    if (table === 'diligence_schedule') {
      return { id: 'sched-1' };
    }
    if (table === 'schedule_week') {
      return { id: 'week-next', schedule_id: 'sched-1', week_no: 3 };
    }
    if (table === 'checklist_item') {
      return [{ id: 'item-1' }, { id: 'item-2' }];
    }
    if (table === 'seller_question') {
      return [{ id: 'question-1' }];
    }

    return { id: `${table}-1` };
  }

  function makeBuilder(table: string) {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;

    builder.select = chain;
    builder.order = chain;
    builder.limit = chain;
    builder.single = chain;
    builder.throwOnError = chain;
    builder.eq = (column: string, value: unknown) => {
      eqSpy(table, column, value);
      return builder;
    };
    builder.in = (column: string, values: unknown) => {
      inSpy(table, column, values);
      return builder;
    };
    builder.update = (payload: unknown) => {
      updateSpy(table, payload);
      return builder;
    };
    builder.then = (resolve: (value: unknown) => void) =>
      resolve({ data: dataFor(table), error: null });

    return builder;
  }

  const from = vi.fn((table: string) => makeBuilder(table));

  return { eqSpy, inSpy, updateSpy, from };
});

vi.mock('@tuckin/next/actions', () => ({
  enhanceAction: (fn: unknown) => fn,
}));

vi.mock('@tuckin/supabase/server', () => ({
  getSupabaseServerClient: () => ({ from: mocks.from }),
}));

import { sellerWeekView, slipUnreceived } from './actions';

const runSlipUnreceived = slipUnreceived as unknown as (
  data: Record<string, unknown>,
) => Promise<unknown>;

const runSellerWeekView = sellerWeekView as unknown as (
  data: Record<string, unknown>,
) => Promise<unknown>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('slipUnreceived', () => {
  it('carries unreceived items forward into the next week', async () => {
    await runSlipUnreceived({ weekId: 'week-3' });

    const itemMove = mocks.updateSpy.mock.calls.find(
      ([table]) => table === 'checklist_item',
    );

    expect(itemMove?.[1]).toEqual({ schedule_week_id: 'week-next' });
    expect(mocks.inSpy).toHaveBeenCalledWith('checklist_item', 'status', [
      'not_started',
      'requested',
    ]);
  });

  it('tags the source week as slipped', async () => {
    await runSlipUnreceived({ weekId: 'week-3' });

    const weekTag = mocks.updateSpy.mock.calls.find(
      ([table]) => table === 'schedule_week',
    );

    expect(weekTag?.[1]).toEqual({ status: 'slipped' });
  });
});

describe('sellerWeekView', () => {
  it('returns only the requested week of checklist items and seller questions', async () => {
    await runSellerWeekView({ dealId: 'deal-1', weekNo: 4 });

    const itemScope = mocks.eqSpy.mock.calls.filter(
      ([table, column]) =>
        table === 'checklist_item' && column === 'schedule_week_id',
    );
    const questionScope = mocks.eqSpy.mock.calls.filter(
      ([table, column]) =>
        table === 'seller_question' && column === 'schedule_week_id',
    );

    expect(itemScope).toEqual([
      ['checklist_item', 'schedule_week_id', 'week-next'],
    ]);
    expect(questionScope).toEqual([
      ['seller_question', 'schedule_week_id', 'week-next'],
    ]);
    expect(mocks.eqSpy).toHaveBeenCalledWith('schedule_week', 'week_no', 4);
  });
});
