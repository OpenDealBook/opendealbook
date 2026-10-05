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
import { deleteWorksheetRow, saveWorksheetRow } from './worksheet-actions';

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

describe('saveWorksheetRow (integration)', () => {
  it('inserts a new row, resolving the account from the deal', async () => {
    const dealId = await newDeal('Worksheet insert deal');
    holder.client = account.user;

    const saved = (await (saveWorksheetRow as unknown as Action)(
      {
        deal_id: dealId,
        worksheet_type: 'margin_analysis',
        data: { line_item: 'Widgets', revenue: 100, direct_cost: 60 },
        sort_order: 0,
      },
      actor,
    )) as Record<string, unknown>;

    expect(saved).toMatchObject({
      deal_id: dealId,
      account_id: account.accountId,
      worksheet_type: 'margin_analysis',
      data: { line_item: 'Widgets', revenue: 100, direct_cost: 60 },
      sort_order: 0,
    });
  });

  it('updates an existing row in place when an id is given', async () => {
    const dealId = await newDeal('Worksheet update deal');
    holder.client = account.user;

    const inserted = (await (saveWorksheetRow as unknown as Action)(
      {
        deal_id: dealId,
        worksheet_type: 'process_sop',
        data: { process: 'Invoicing', status: 'not_started' },
        sort_order: 0,
      },
      actor,
    )) as Record<string, unknown>;

    const updated = (await (saveWorksheetRow as unknown as Action)(
      {
        id: inserted.id,
        deal_id: dealId,
        worksheet_type: 'process_sop',
        data: { process: 'Invoicing', status: 'documented' },
        sort_order: 0,
      },
      actor,
    )) as Record<string, unknown>;

    expect(updated.id).toBe(inserted.id);
    expect(updated.data).toMatchObject({ status: 'documented' });

    const { data: rows } = await account.admin
      .from('deal_worksheet_row')
      .select('id')
      .eq('deal_id', dealId)
      .eq('worksheet_type', 'process_sop');

    expect(rows).toHaveLength(1);
  });

  it('allows multiple rows per deal and worksheet_type as distinct rows', async () => {
    const dealId = await newDeal('Worksheet multi-row deal');
    holder.client = account.user;

    await (saveWorksheetRow as unknown as Action)(
      {
        deal_id: dealId,
        worksheet_type: 'retention_plan',
        data: { employee: 'Jane', flight_risk: 'high' },
        sort_order: 1,
      },
      actor,
    );
    await (saveWorksheetRow as unknown as Action)(
      {
        deal_id: dealId,
        worksheet_type: 'retention_plan',
        data: { employee: 'Sam', flight_risk: 'low' },
        sort_order: 0,
      },
      actor,
    );

    const { data: rows } = await account.admin
      .from('deal_worksheet_row')
      .select('data')
      .eq('deal_id', dealId)
      .eq('worksheet_type', 'retention_plan')
      .order('sort_order', { ascending: true });

    expect(rows).toHaveLength(2);
    expect((rows?.[0]?.data as Record<string, unknown>).employee).toBe('Sam');
    expect((rows?.[1]?.data as Record<string, unknown>).employee).toBe('Jane');
  });

  it('is not readable by a user outside the buyer account', async () => {
    const dealId = await newDeal('Worksheet visibility deal');
    holder.client = account.user;

    await (saveWorksheetRow as unknown as Action)(
      {
        deal_id: dealId,
        worksheet_type: 'marketing_effectiveness',
        data: { channel: 'Referral', spend: 0, leads: 0, customers: 0 },
        sort_order: 0,
      },
      actor,
    );

    const { data: rows } = await outsider.user
      .from('deal_worksheet_row')
      .select('id')
      .eq('deal_id', dealId);

    expect(rows).toEqual([]);
  });
});

describe('deleteWorksheetRow (integration)', () => {
  it('removes the row', async () => {
    const dealId = await newDeal('Worksheet delete deal');
    holder.client = account.user;

    const inserted = (await (saveWorksheetRow as unknown as Action)(
      {
        deal_id: dealId,
        worksheet_type: 'margin_analysis',
        data: { line_item: 'Gadgets', revenue: 50, direct_cost: 10 },
        sort_order: 0,
      },
      actor,
    )) as Record<string, unknown>;

    await (deleteWorksheetRow as unknown as Action)(
      { id: inserted.id },
      actor,
    );

    const { data: rows } = await account.admin
      .from('deal_worksheet_row')
      .select('id')
      .eq('id', inserted.id as string);

    expect(rows).toEqual([]);
  });
});
