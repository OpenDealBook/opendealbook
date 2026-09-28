import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const appendEventsSpy = vi.fn();

  function dataFor(table: string): unknown {
    if (table === 'checklist_template_item') {
      return [
        {
          category: 'financials',
          title: 'Trailing P&L',
          priority: 8,
          deal_killer: true,
          due_offset_days: 7,
        },
        {
          category: 'hr',
          title: 'Org chart',
          priority: 2,
          deal_killer: false,
          due_offset_days: 21,
        },
      ];
    }

    return { id: `${table}-1` };
  }

  function makeBuilder(table: string) {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;

    builder.select = chain;
    builder.eq = chain;
    builder.order = chain;
    builder.single = chain;
    builder.throwOnError = chain;
    builder.then = (resolve: (value: unknown) => void) =>
      resolve({ data: dataFor(table), error: null });

    return builder;
  }

  const from = vi.fn((table: string) => makeBuilder(table));
  const rpc = vi.fn(() => Promise.resolve({ data: true, error: null }));
  const client = { from, rpc };

  return { appendEventsSpy, from, rpc, client };
});

vi.mock('@odb/next/actions', () => ({
  enhanceAction: (fn: unknown) => fn,
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => mocks.client,
}));

vi.mock('@odb/events', () => ({
  appendDealEvent: vi.fn(),
  appendDealEvents: (client: unknown, dealId: unknown, events: unknown) => {
    mocks.appendEventsSpy(client, dealId, events);
    return Promise.resolve([{ deal_seq: 1, aggregate_seq: 1 }]);
  },
}));

import { applyTemplateToDeal } from './actions';

const runApplyTemplateToDeal = applyTemplateToDeal as unknown as (
  data: Record<string, unknown>,
) => Promise<unknown>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('applyTemplateToDeal', () => {
  it('appends one checklist_item.added event per template item in a single batch', async () => {
    await runApplyTemplateToDeal({ dealId: 'deal-1', templateId: 'tpl-1' });

    expect(mocks.appendEventsSpy).toHaveBeenCalledTimes(1);

    const [client, dealId, events] = mocks.appendEventsSpy.mock.calls[0] as [
      unknown,
      string,
      Array<Record<string, unknown>>,
    ];

    expect(client).toBe(mocks.client);
    expect(dealId).toBe('deal-1');
    expect(events).toHaveLength(2);

    expect(events[0]).toMatchObject({
      aggregateType: 'checklist_item',
      eventType: 'checklist_item.added',
      payload: {
        category: 'financials',
        title: 'Trailing P&L',
        owner_user_id: null,
        due_at: null,
        status: null,
        priority: 8,
        deal_killer: true,
        schedule_week_id: null,
      },
    });
    expect(typeof events[0]!.aggregateId).toBe('string');

    expect(events[1]).toMatchObject({
      aggregateType: 'checklist_item',
      eventType: 'checklist_item.added',
      payload: {
        category: 'hr',
        title: 'Org chart',
        priority: 2,
        deal_killer: false,
      },
    });
    expect(typeof events[1]!.aggregateId).toBe('string');
    expect(events[0]!.aggregateId).not.toBe(events[1]!.aggregateId);
  });
});
