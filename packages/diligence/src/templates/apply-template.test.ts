import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const insertSpy = vi.fn();

  function dataFor(table: string): unknown {
    if (table === 'deal') {
      return { account_id: 'acct-1' };
    }
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
    builder.insert = (payload: unknown) => {
      insertSpy(table, payload);
      return builder;
    };
    builder.then = (resolve: (value: unknown) => void) =>
      resolve({ data: dataFor(table), error: null });

    return builder;
  }

  const from = vi.fn((table: string) => makeBuilder(table));
  const rpc = vi.fn(() => Promise.resolve({ data: true, error: null }));

  return { insertSpy, from, rpc };
});

vi.mock('@odb/next/actions', () => ({
  enhanceAction: (fn: unknown) => fn,
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({ from: mocks.from, rpc: mocks.rpc }),
}));

import { applyTemplateToDeal } from './actions';

const runApplyTemplateToDeal = applyTemplateToDeal as unknown as (
  data: Record<string, unknown>,
) => Promise<unknown>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('applyTemplateToDeal', () => {
  it('copies deal_killer and priority from each template item onto the deal', async () => {
    await runApplyTemplateToDeal({ dealId: 'deal-1', templateId: 'tpl-1' });

    const checklistInsert = mocks.insertSpy.mock.calls.find(
      ([table]) => table === 'checklist_item',
    );
    const rows = checklistInsert?.[1] as Array<Record<string, unknown>>;

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      account_id: 'acct-1',
      deal_id: 'deal-1',
      title: 'Trailing P&L',
      priority: 8,
      deal_killer: true,
      due_offset_days: 7,
    });
    expect(rows[1]).toMatchObject({ priority: 2, deal_killer: false });
  });
});
