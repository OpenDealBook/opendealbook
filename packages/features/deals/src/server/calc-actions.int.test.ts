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
import {
  adoptCalcVersion,
  createCalcVersion,
  saveDealCalc,
  saveSdeCalc,
} from './calc-actions';

type Action = (
  data: Record<string, unknown>,
  user: { id: string },
) => Promise<unknown>;

const round2 = (value: number) => Number(value.toFixed(2));

const referenceSdePeriods = [
  { label: 'Two years ago', weight: 0.2, lines: [{ line_code: 'sales', amount: 0 }] },
  { label: 'Last year', weight: 0.3, lines: [{ line_code: 'sales', amount: 561_646 }] },
  {
    label: 'Stub',
    weight: 0.5,
    months: 3,
    lines: [{ line_code: 'sales', amount: 169_591 }],
  },
];

const referenceDealInputs = {
  pl: {
    sales: 163_000,
    cogs: 0,
    opex: 0,
    depreciation_amortization: 0,
    taxes: 0,
    interest: 0,
    owner_benefits: 0,
  },
  purchase_price: 619_150,
  closing_costs: 41_000,
  annual_growth: 0,
  required_personal_cash_flow: 100_000,
  dscr_mode: 'tax_adjusted',
  tax_rate: 0.2564,
};

const referenceFunding = [
  { type: 'sba_7a', amount: 612_152, rate: 0.115, term_years: 10 },
];

let account: IntegrationAccount;
let actor: { id: string };
let dealId: string;

async function newCalcVersion(type: 'sde' | 'deal'): Promise<string> {
  return (await (createCalcVersion as unknown as Action)(
    { deal_id: dealId, type },
    actor,
  )) as string;
}

beforeAll(async () => {
  account = await provisionAccount();
  holder.client = account.user;
  actor = { id: account.userId };
  dealId = (await (createDeal as unknown as Action)(
    {
      account_id: account.accountId,
      description: 'Calculator deal',
      source: 'manual',
      stage: 'sourcing',
    },
    actor,
  )) as string;
});

afterAll(async () => {
  await account.cleanup();
});

describe('saveSdeCalc (integration)', () => {
  it('persists periods and lines and snapshots the weighted SDE 507676 through the stored path', async () => {
    const calcVersionId = await newCalcVersion('sde');

    await (saveSdeCalc as unknown as Action)(
      { calc_version_id: calcVersionId, periods: referenceSdePeriods },
      actor,
    );

    const { data: periods } = await account.admin
      .from('sde_period')
      .select('id, weight, months')
      .eq('calc_version_id', calcVersionId);

    expect(periods).toHaveLength(3);

    const periodIds = (periods ?? []).map((period) => period.id);

    const { data: lines } = await account.admin
      .from('sde_line')
      .select('id, period_id')
      .in('period_id', periodIds);

    expect((lines ?? []).length).toBeGreaterThanOrEqual(3);

    const { data: version } = await account.admin
      .from('calc_version')
      .select('outputs_snapshot')
      .eq('id', calcVersionId)
      .single();

    const snapshot = version?.outputs_snapshot as {
      weighted_sde: number;
      periods: Array<{ annualized_sde: number }>;
      adopt: { sde: number; ebitda: number };
    };

    expect(snapshot.weighted_sde).toBe(507_676);
    expect(snapshot.periods[2]?.annualized_sde).toBe(678_364);
    expect(snapshot.adopt.sde).toBe(507_676);
  });
});

describe('saveDealCalc (integration)', () => {
  it('persists inputs plus funding and snapshots DSCR 1.43x through the stored path', async () => {
    const calcVersionId = await newCalcVersion('deal');

    await (saveDealCalc as unknown as Action)(
      {
        calc_version_id: calcVersionId,
        inputs: referenceDealInputs,
        funding_sources: referenceFunding,
      },
      actor,
    );

    const { data: input } = await account.admin
      .from('deal_calc_input')
      .select('calc_version_id, inputs')
      .eq('calc_version_id', calcVersionId)
      .single();

    expect(input?.calc_version_id).toBe(calcVersionId);

    const { data: funding } = await account.admin
      .from('funding_source')
      .select('type, amount')
      .eq('calc_version_id', calcVersionId);

    expect(funding).toHaveLength(1);
    expect(funding?.[0]).toMatchObject({ type: 'sba_7a', amount: 612_152 });

    const { data: version } = await account.admin
      .from('calc_version')
      .select('outputs_snapshot')
      .eq('id', calcVersionId)
      .single();

    const snapshot = version?.outputs_snapshot as {
      sde: number;
      dscr: number;
      net_cash_flow: number;
      adopt: { revenue: number; sde: number; ebitda: number };
    };

    expect(snapshot.sde).toBe(163_000);
    expect(round2(snapshot.dscr)).toBe(1.43);
    expect(snapshot.net_cash_flow).toBeCloseTo(59_721, 0);
  });
});

describe('adoptCalcVersion (integration)', () => {
  it('promotes a stored deal-calc snapshot into deal_financials', async () => {
    const calcVersionId = await newCalcVersion('deal');

    await (saveDealCalc as unknown as Action)(
      {
        calc_version_id: calcVersionId,
        inputs: referenceDealInputs,
        funding_sources: referenceFunding,
      },
      actor,
    );

    await (adoptCalcVersion as unknown as Action)(
      { deal_id: dealId, calc_version_id: calcVersionId },
      actor,
    );

    const { data: financials } = await account.admin
      .from('deal_financials')
      .select('deal_id, adopted_revenue, adopted_sde, adopted_ebitda, source_calc_version_id')
      .eq('deal_id', dealId)
      .single();

    expect(financials).toMatchObject({
      deal_id: dealId,
      adopted_revenue: 163_000,
      adopted_sde: 163_000,
      adopted_ebitda: 163_000,
      source_calc_version_id: calcVersionId,
    });
  });
});
