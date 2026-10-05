import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  type IntegrationAccount,
  provisionAccount,
} from '../../test-support/integration-harness';

const holder = vi.hoisted(() => ({
  client: null as unknown,
}));

vi.mock('@odb/next/actions', () => ({
  enhanceAction: (fn: unknown) => fn,
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => holder.client,
}));

import { createDeal } from './deal-actions';
import { saveDealOperatingPeriod } from './operating-actions';

type Action = (
  data: Record<string, unknown>,
  user: { id: string },
) => Promise<unknown>;

let account: IntegrationAccount;
let outsider: IntegrationAccount;
let actor: { id: string };

async function newDeal(description: string): Promise<string> {
  holder.client = account.user;
  return (await (createDeal as unknown as Action)(
    {
      account_id: account.accountId,
      description,
      source: 'manual',
      stage: 'sourcing',
    },
    actor,
  )) as string;
}

beforeAll(async () => {
  account = await provisionAccount();
  outsider = await provisionAccount();
  actor = { id: account.userId };
});

afterAll(async () => {
  await account.cleanup();
  await outsider.cleanup();
});

describe('saveDealOperatingPeriod (integration)', () => {
  it('persists a month of operating actuals, resolving the account from the deal', async () => {
    const dealId = await newDeal('Operating period capture deal');
    holder.client = account.user;

    const saved = (await (saveDealOperatingPeriod as unknown as Action)(
      {
        deal_id: dealId,
        period_month: '2026-09-01',
        revenue: 100_000,
        cogs: 40_000,
        opex: 20_000,
        cash_balance: 250_000,
        headcount: 8,
        debt_service: 5_000,
        notes: 'Normal month.',
      },
      actor,
    )) as Record<string, unknown>;

    expect(saved).toMatchObject({
      deal_id: dealId,
      account_id: account.accountId,
      period_month: '2026-09-01',
      headcount: 8,
      notes: 'Normal month.',
    });
    expect(Number(saved.revenue)).toBe(100_000);
    expect(Number(saved.cogs)).toBe(40_000);
    expect(Number(saved.opex)).toBe(20_000);
    expect(Number(saved.cash_balance)).toBe(250_000);
    expect(Number(saved.debt_service)).toBe(5_000);
  });

  it('upserts one row per deal and month, updating in place on a second save', async () => {
    const dealId = await newDeal('Operating period upsert deal');
    holder.client = account.user;

    await (saveDealOperatingPeriod as unknown as Action)(
      { deal_id: dealId, period_month: '2026-09-01', revenue: 90_000 },
      actor,
    );
    await (saveDealOperatingPeriod as unknown as Action)(
      { deal_id: dealId, period_month: '2026-09-01', revenue: 110_000 },
      actor,
    );

    const { data: rows } = await account.admin
      .from('deal_operating_period')
      .select('revenue')
      .eq('deal_id', dealId)
      .eq('period_month', '2026-09-01');

    expect(rows).toHaveLength(1);
    expect(Number(rows?.[0]?.revenue)).toBe(110_000);
  });

  it('allows a second month for the same deal as a distinct row', async () => {
    const dealId = await newDeal('Operating period second month deal');
    holder.client = account.user;

    await (saveDealOperatingPeriod as unknown as Action)(
      { deal_id: dealId, period_month: '2026-09-01', revenue: 90_000 },
      actor,
    );
    await (saveDealOperatingPeriod as unknown as Action)(
      { deal_id: dealId, period_month: '2026-10-01', revenue: 95_000 },
      actor,
    );

    const { data: rows } = await account.admin
      .from('deal_operating_period')
      .select('period_month')
      .eq('deal_id', dealId);

    expect(rows).toHaveLength(2);
  });

  it('is not readable by a user outside the buyer account', async () => {
    const dealId = await newDeal('Operating period visibility deal');
    holder.client = account.user;

    await (saveDealOperatingPeriod as unknown as Action)(
      { deal_id: dealId, period_month: '2026-09-01', notes: 'Buyer-private.' },
      actor,
    );

    const { data: rows } = await outsider.user
      .from('deal_operating_period')
      .select('id')
      .eq('deal_id', dealId);

    expect(rows).toEqual([]);
  });
});
