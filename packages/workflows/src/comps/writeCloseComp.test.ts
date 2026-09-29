import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ContributorDealInput } from '@odb/comps';

import { writeCloseComp } from './writeCloseComp';

const state = vi.hoisted(() => ({ client: null as unknown }));

vi.mock('@odb/supabase/admin', () => ({
  getSupabaseServerAdminClient: () => state.client,
}));

function makeClient() {
  const capture = { inserts: {} as Record<string, unknown> };
  const client = {
    from(table: string) {
      return {
        insert(row: unknown) {
          capture.inserts[table] = row;
          return {
            select: () => ({ single: async () => ({ data: { id: 'comp-1' }, error: null }) }),
          };
        },
      };
    },
  };
  return { client, capture };
}

const deal: ContributorDealInput = {
  businessDescription: 'Solo tax practice',
  naicsCode: '541213',
  saleDate: '2025-11-30',
  transactionType: 'Asset',
  salePrice: 900_000,
  revenue: 600_000,
  sde: 250_000,
  ebitda: 210_000,
  state: 'CA',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('writeCloseComp', () => {
  it('writes the tenant internal comp row via the service-role client', async () => {
    const { client, capture } = makeClient();
    state.client = client;

    const result = await writeCloseComp({
      dealId: 'deal-1',
      accountId: 'acct-1',
      actorUserId: 'user-1',
      deal,
    });

    expect(result.compId).toBe('comp-1');
    expect(capture.inserts.comp).toMatchObject({
      account_id: 'acct-1',
      deal_id: 'deal-1',
      data_class: 'internal',
      source: 'own_close',
      naics_code: '541213',
      state: 'CA',
      close_date: '2025-11-30',
      sale_price: 900_000,
      revenue: 600_000,
      sde: 250_000,
      ebitda: 210_000,
      created_by: 'user-1',
    });
  });

  it('generates the DealStats contributor package and offers the contributor-member flag', async () => {
    const { client } = makeClient();
    state.client = client;

    const result = await writeCloseComp({
      dealId: 'deal-1',
      accountId: 'acct-1',
      deal,
    });

    expect(result.contributorPackage.vendor).toBe('DealStats');
    expect(result.contributorPackage.fields['MVIC Price']).toBe(900_000);
    expect(result.contributorOffer).toEqual({ vendor: 'DealStats', setContributorMember: true });
  });
});
