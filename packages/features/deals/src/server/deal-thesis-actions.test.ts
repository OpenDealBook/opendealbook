import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const upsertSpy = vi.fn();

  function dataFor(table: string): unknown {
    if (table === 'deal') {
      return { id: 'deal-1', account_id: 'account-1' };
    }

    return { id: `${table}-1` };
  }

  function makeBuilder(table: string) {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;

    builder.select = chain;
    builder.eq = chain;
    builder.single = chain;
    builder.maybeSingle = chain;
    builder.throwOnError = chain;
    builder.upsert = (payload: unknown, options: unknown) => {
      upsertSpy(table, payload, options);
      return builder;
    };
    builder.then = (resolve: (value: unknown) => void) =>
      resolve({ data: dataFor(table), error: null });

    return builder;
  }

  const from = vi.fn((table: string) => makeBuilder(table));

  return { upsertSpy, from };
});

vi.mock('@odb/next/actions', () => ({
  enhanceAction: (fn: unknown) => fn,
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({ from: mocks.from }),
}));

import { dealThesisSchema } from '../schema/deal-thesis.schema';
import { upsertDealThesis } from './deal-thesis-actions';

type Action = (
  data: Record<string, unknown>,
  user: { id: string },
) => Promise<unknown>;

const runUpsertDealThesis = upsertDealThesis as unknown as Action;

const dealUuid = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('upsertDealThesis', () => {
  it('resolves the account from the deal and upserts on conflict of deal_id', async () => {
    await runUpsertDealThesis(
      {
        deal_id: 'deal-1',
        why_this_business: 'Strong recurring revenue',
        main_concerns: 'Owner dependency',
      },
      { id: 'user-1' },
    );

    const [table, payload, options] = mocks.upsertSpy.mock.calls.at(
      -1,
    ) as unknown as [string, Record<string, unknown>, Record<string, unknown>];

    expect(table).toBe('deal_thesis');
    expect(payload).toEqual({
      deal_id: 'deal-1',
      account_id: 'account-1',
      why_this_business: 'Strong recurring revenue',
      main_concerns: 'Owner dependency',
    });
    expect(options).toEqual({ onConflict: 'deal_id' });
  });
});

describe('dealThesisSchema char limits', () => {
  it('rejects why_this_business over 2000 characters', () => {
    const result = dealThesisSchema.safeParse({
      deal_id: dealUuid,
      why_this_business: 'a'.repeat(2001),
    });

    expect(result.success).toBe(false);
  });

  it('accepts additional_info at the 5000 character limit', () => {
    const result = dealThesisSchema.safeParse({
      deal_id: dealUuid,
      additional_info: 'a'.repeat(5000),
    });

    expect(result.success).toBe(true);
  });
});
