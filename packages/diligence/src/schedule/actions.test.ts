import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const eqSpy = vi.fn();
  const inSpy = vi.fn();
  const updateSpy = vi.fn();
  const appendSpy = vi.fn();
  const appendEventsSpy = vi.fn();

  function singleFor(table: string): unknown {
    if (table === 'diligence_schedule') {
      return { id: 'sched-1', deal_id: 'deal-1' };
    }
    if (table === 'schedule_week') {
      return { id: 'week-next', schedule_id: 'sched-1', week_no: 3 };
    }
    if (table === 'checklist_item') {
      return { id: 'item-1', deal_id: 'deal-1' };
    }

    return { id: `${table}-1` };
  }

  function listFor(table: string): unknown[] {
    if (table === 'checklist_item') {
      return [{ id: 'item-1' }, { id: 'item-2' }];
    }
    if (table === 'seller_question') {
      return [{ id: 'question-1' }];
    }

    return [];
  }

  function makeBuilder(table: string) {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    let singleMode = false;

    builder.select = chain;
    builder.order = chain;
    builder.limit = chain;
    builder.throwOnError = chain;
    builder.single = () => {
      singleMode = true;
      return builder;
    };
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
      resolve({
        data: singleMode ? singleFor(table) : listFor(table),
        error: null,
      });

    return builder;
  }

  const from = vi.fn((table: string) => makeBuilder(table));
  const client = { from };

  return { eqSpy, inSpy, updateSpy, appendSpy, appendEventsSpy, from, client };
});

vi.mock('@odb/next/actions', () => ({
  enhanceAction: (fn: unknown) => fn,
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => mocks.client,
}));

vi.mock('@odb/events', () => ({
  appendDealEvent: (client: unknown, input: unknown) => {
    mocks.appendSpy(client, input);
    return Promise.resolve([{ deal_seq: 1, aggregate_seq: 1 }]);
  },
  appendDealEvents: (client: unknown, dealId: unknown, events: unknown) => {
    mocks.appendEventsSpy(client, dealId, events);
    return Promise.resolve([{ deal_seq: 1, aggregate_seq: 1 }]);
  },
}));

import { assignItemToWeek, sellerWeekView, slipUnreceived } from './actions';

type Action = (data: Record<string, unknown>) => Promise<unknown>;

const runAssignItemToWeek = assignItemToWeek as unknown as Action;
const runSlipUnreceived = slipUnreceived as unknown as Action;
const runSellerWeekView = sellerWeekView as unknown as Action;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('assignItemToWeek', () => {
  it('reschedules the item onto the target week via a deal event', async () => {
    await runAssignItemToWeek({
      checklistItemId: 'item-1',
      weekId: 'week-7',
    });

    expect(mocks.appendSpy).toHaveBeenCalledTimes(1);

    const [client, input] = mocks.appendSpy.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
    ];

    expect(client).toBe(mocks.client);
    expect(input).toMatchObject({
      dealId: 'deal-1',
      aggregateType: 'checklist_item',
      aggregateId: 'item-1',
      eventType: 'checklist_item.rescheduled',
      payload: { schedule_week_id: 'week-7' },
    });
  });
});

describe('slipUnreceived', () => {
  it('reschedules every unreceived item into the next week in one batch', async () => {
    await runSlipUnreceived({ weekId: 'week-3' });

    expect(mocks.appendEventsSpy).toHaveBeenCalledTimes(1);

    const [client, dealId, events] = mocks.appendEventsSpy.mock.calls[0] as [
      unknown,
      string,
      Array<Record<string, unknown>>,
    ];

    expect(client).toBe(mocks.client);
    expect(dealId).toBe('deal-1');
    expect(events).toEqual([
      {
        aggregateType: 'checklist_item',
        aggregateId: 'item-1',
        eventType: 'checklist_item.rescheduled',
        payload: { schedule_week_id: 'week-next' },
      },
      {
        aggregateType: 'checklist_item',
        aggregateId: 'item-2',
        eventType: 'checklist_item.rescheduled',
        payload: { schedule_week_id: 'week-next' },
      },
    ]);

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
