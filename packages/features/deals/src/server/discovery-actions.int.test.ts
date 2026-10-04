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
import { saveDealDiscovery } from './discovery-actions';

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

describe('saveDealDiscovery (integration)', () => {
  it('persists the structured discovery fields and notes, resolving the account from the deal', async () => {
    const dealId = await newDeal('Discovery capture deal');
    holder.client = account.user;

    const saved = (await (saveDealDiscovery as unknown as Action)(
      {
        deal_id: dealId,
        counterparty_type: 'owner',
        call_date: '2026-10-04',
        years_in_operation: 12,
        reason_for_selling: 'retirement',
        what_matters_most: ['legacy', 'employees'],
        most_sensitive_issue: 'Key client concentration',
        owner_hours_per_week: 55,
        owner_dependency: 'high',
        documented_processes: false,
        recurring_revenue_pct: 42.5,
        revenue_trend: 'up',
        open_to_seller_financing: 'unsure',
        discovery_notes: 'Warm first call, owner wants to stay 6 months.',
      },
      actor,
    )) as Record<string, unknown>;

    expect(saved).toMatchObject({
      deal_id: dealId,
      account_id: account.accountId,
      counterparty_type: 'owner',
      call_date: '2026-10-04',
      years_in_operation: 12,
      reason_for_selling: 'retirement',
      what_matters_most: ['legacy', 'employees'],
      owner_dependency: 'high',
      documented_processes: false,
      revenue_trend: 'up',
      open_to_seller_financing: 'unsure',
      discovery_notes: 'Warm first call, owner wants to stay 6 months.',
    });
    expect(Number(saved.recurring_revenue_pct)).toBe(42.5);
  });

  it('upserts one record per deal, updating in place on a second save', async () => {
    const dealId = await newDeal('Discovery upsert deal');
    holder.client = account.user;

    await (saveDealDiscovery as unknown as Action)(
      { deal_id: dealId, employee_count: 4, revenue_trend: 'flat' },
      actor,
    );
    await (saveDealDiscovery as unknown as Action)(
      { deal_id: dealId, employee_count: 7, revenue_trend: 'up' },
      actor,
    );

    const { data: rows } = await account.admin
      .from('deal_discovery')
      .select('employee_count, revenue_trend')
      .eq('deal_id', dealId);

    expect(rows).toHaveLength(1);
    expect(rows?.[0]).toMatchObject({ employee_count: 7, revenue_trend: 'up' });
  });

  it('is not readable by a user outside the buyer account', async () => {
    const dealId = await newDeal('Discovery visibility deal');
    holder.client = account.user;

    await (saveDealDiscovery as unknown as Action)(
      { deal_id: dealId, discovery_notes: 'Buyer-private.' },
      actor,
    );

    const { data: rows } = await outsider.user
      .from('deal_discovery')
      .select('id')
      .eq('deal_id', dealId);

    expect(rows).toEqual([]);
  });
});
