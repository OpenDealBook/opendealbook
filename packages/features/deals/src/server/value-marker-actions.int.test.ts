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
import { saveDealValueMarkers } from './value-marker-actions';

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

describe('saveDealValueMarkers (integration)', () => {
  it('persists a rating and notes per question, resolving the account from the deal', async () => {
    const dealId = await newDeal('Value marker capture deal');
    holder.client = account.user;

    const saved = (await (saveDealValueMarkers as unknown as Action)(
      {
        deal_id: dealId,
        markers: [
          {
            category: 'owner_dependency',
            question_key: 'owner_dependency.daily_operations',
            rating: 'not_good',
            notes: 'Owner runs every customer relationship personally.',
          },
          {
            category: 'recurring_revenue',
            question_key: 'recurring_revenue.contract_share',
            rating: 'looks_good',
          },
        ],
      },
      actor,
    )) as Record<string, unknown>[];

    expect(saved).toHaveLength(2);
    expect(saved).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          deal_id: dealId,
          account_id: account.accountId,
          category: 'owner_dependency',
          question_key: 'owner_dependency.daily_operations',
          rating: 'not_good',
          notes: 'Owner runs every customer relationship personally.',
        }),
        expect.objectContaining({
          question_key: 'recurring_revenue.contract_share',
          rating: 'looks_good',
        }),
      ]),
    );
  });

  it('upserts one row per question, updating the rating in place on a second save', async () => {
    const dealId = await newDeal('Value marker upsert deal');
    holder.client = account.user;

    await (saveDealValueMarkers as unknown as Action)(
      {
        deal_id: dealId,
        markers: [
          {
            category: 'cashflow_quality',
            question_key: 'cashflow_quality.collections',
            rating: 'somewhat_risky',
          },
        ],
      },
      actor,
    );
    await (saveDealValueMarkers as unknown as Action)(
      {
        deal_id: dealId,
        markers: [
          {
            category: 'cashflow_quality',
            question_key: 'cashflow_quality.collections',
            rating: 'looks_good',
          },
        ],
      },
      actor,
    );

    const { data: rows } = await account.admin
      .from('deal_value_marker')
      .select('question_key, rating')
      .eq('deal_id', dealId);

    expect(rows).toHaveLength(1);
    expect(rows?.[0]).toMatchObject({
      question_key: 'cashflow_quality.collections',
      rating: 'looks_good',
    });
  });

  it('is not readable by a user outside the buyer account', async () => {
    const dealId = await newDeal('Value marker visibility deal');
    holder.client = account.user;

    await (saveDealValueMarkers as unknown as Action)(
      {
        deal_id: dealId,
        markers: [
          {
            category: 'process_maturity',
            question_key: 'process_maturity.bookkeeping',
            rating: 'looks_good',
          },
        ],
      },
      actor,
    );

    const { data: rows } = await outsider.user
      .from('deal_value_marker')
      .select('id')
      .eq('deal_id', dealId);

    expect(rows).toEqual([]);
  });
});
