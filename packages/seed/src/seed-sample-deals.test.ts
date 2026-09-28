import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SAMPLE_TAG,
  hasSampleData,
  seedSampleDeals,
} from './seed-sample-deals';

type Insert = { table: string; rows: unknown };

const inserts: Insert[] = [];
let selectData: unknown[] = [];

const from = vi.fn((table: string) => {
  const builder: Record<string, unknown> = {};

  for (const method of ['select', 'eq', 'ilike', 'limit']) {
    builder[method] = vi.fn(() => builder);
  }

  builder.insert = vi.fn((rows: unknown) => {
    inserts.push({ table, rows });
    return builder;
  });

  builder.then = (resolve: (value: unknown) => unknown) =>
    resolve({ data: selectData, error: null });

  return builder;
});

vi.mock('@tuckin/supabase/admin', () => ({
  getSupabaseServerAdminClient: () => ({ from }),
}));

function rowsFor(table: string): Record<string, unknown>[] {
  const entry = inserts.find((insert) => insert.table === table);
  return (entry?.rows ?? []) as Record<string, unknown>[];
}

const seedArgs = {
  accountId: '00000000-0000-0000-0000-000000000001',
  userId: '00000000-0000-0000-0000-0000000000aa',
};

describe('seedSampleDeals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inserts.length = 0;
    selectData = [];
  });

  it('inserts sample firms, deals, and checklist items marked as examples', async () => {
    await seedSampleDeals(seedArgs);

    const firms = rowsFor('firm');
    const deals = rowsFor('deal');
    const checklist = rowsFor('checklist_item');

    expect(firms).toHaveLength(4);
    expect(
      firms.every((firm) => String(firm.name).startsWith(SAMPLE_TAG)),
    ).toBe(true);
    expect(deals).toHaveLength(4);
    expect(checklist.length).toBeGreaterThanOrEqual(6);
    expect(checklist.some((item) => item.deal_killer === true)).toBe(true);
  });

  it('short-circuits a second run when sample data already exists', async () => {
    selectData = [{ id: 'existing-firm' }];

    expect(await hasSampleData(seedArgs.accountId)).toBe(true);

    inserts.length = 0;
    await seedSampleDeals(seedArgs);

    expect(inserts).toHaveLength(0);
  });
});
