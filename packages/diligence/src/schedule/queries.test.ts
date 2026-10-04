import { describe, expect, it, vi } from 'vitest';

import { fetchDealSchedule } from './queries';

function stubClient(options: {
  schedule: unknown;
  weeks: unknown[];
}) {
  const eqSpy = vi.fn();
  const orderSpy = vi.fn();

  function makeBuilder(table: string) {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    let singleMode = false;

    builder.select = chain;
    builder.limit = chain;
    builder.throwOnError = chain;
    builder.maybeSingle = () => {
      singleMode = true;
      return builder;
    };
    builder.eq = (column: string, value: unknown) => {
      eqSpy(table, column, value);
      return builder;
    };
    builder.order = (column: string, config: unknown) => {
      orderSpy(table, column, config);
      return builder;
    };
    builder.then = (resolve: (value: unknown) => void) =>
      resolve({
        data: singleMode ? options.schedule : options.weeks,
        error: null,
      });

    return builder;
  }

  const from = vi.fn((table: string) => makeBuilder(table));

  return { client: { from } as never, eqSpy, orderSpy };
}

describe('fetchDealSchedule', () => {
  it('returns the latest schedule for the deal with its weeks ordered by week number', async () => {
    const schedule = { id: 'sched-1', deal_id: 'deal-1' };
    const weeks = [{ id: 'week-1', week_no: 1 }, { id: 'week-2', week_no: 2 }];
    const { client, eqSpy, orderSpy } = stubClient({ schedule, weeks });

    const result = await fetchDealSchedule(client, 'deal-1');

    expect(result).toEqual({ schedule, weeks });
    expect(eqSpy).toHaveBeenCalledWith(
      'diligence_schedule',
      'deal_id',
      'deal-1',
    );
    expect(eqSpy).toHaveBeenCalledWith(
      'schedule_week',
      'schedule_id',
      'sched-1',
    );
    expect(orderSpy).toHaveBeenCalledWith('schedule_week', 'week_no', {
      ascending: true,
    });
  });

  it('returns no schedule and no weeks when the deal has none', async () => {
    const { client, eqSpy } = stubClient({ schedule: null, weeks: [] });

    const result = await fetchDealSchedule(client, 'deal-1');

    expect(result).toEqual({ schedule: null, weeks: [] });
    expect(eqSpy).not.toHaveBeenCalledWith(
      'schedule_week',
      'schedule_id',
      expect.anything(),
    );
  });
});
