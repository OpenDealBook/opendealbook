import { createClient } from '@supabase/supabase-js';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Database } from '@odb/supabase';

import {
  type IntegrationAccount,
  provisionAccount,
} from '../../test-support/integration-harness';

const holder = vi.hoisted(() => ({
  client: null as unknown,
  userId: '',
}));

vi.mock('@odb/next/actions', () => ({
  enhanceAction:
    (fn: (data: unknown, user: { id: string }) => unknown) =>
    (data: unknown, user?: { id: string }) =>
      fn(data, user ?? { id: holder.userId }),
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => holder.client,
}));

import {
  adoptCalcVersion,
  createCalcVersion,
  saveDealCalc,
  saveSdeCalc,
  saveWorkingCapitalCalc,
} from './calc-actions';
import { createDealCore } from './deal-actions';

type Action = (
  data: Record<string, unknown>,
  user: { id: string },
) => Promise<unknown>;

const round2 = (value: number) => Number(value.toFixed(2));

const referenceSdePeriods = () => [
  {
    id: crypto.randomUUID(),
    label: 'Two years ago',
    weight: 0.2,
    lines: [{ line_code: 'sales', amount: 0 }],
  },
  {
    id: crypto.randomUUID(),
    label: 'Last year',
    weight: 0.3,
    lines: [{ line_code: 'sales', amount: 561_646 }],
  },
  {
    id: crypto.randomUUID(),
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

const referenceFunding = () => [
  {
    id: crypto.randomUUID(),
    type: 'sba_7a',
    amount: 612_152,
    rate: 0.115,
    term_years: 10,
  },
];

let account: IntegrationAccount;
let actor: { id: string };
let dealId: string;

async function newCalcVersion(
  type: 'sde' | 'deal' | 'working_capital',
): Promise<string> {
  return (
    (await (createCalcVersion as unknown as Action)(
      { deal_id: dealId, type },
      actor,
    )) as { value: string }
  ).value;
}

beforeAll(async () => {
  account = await provisionAccount();
  holder.client = account.user;
  holder.userId = account.userId;
  actor = { id: account.userId };
  dealId = await createDealCore(
    account.user,
    {
      account_id: account.accountId,
      business_name: 'Calculator deal',
      industry: 'Accounting',
      description: 'Calculator deal',
      source: 'manual',
      stage: 'sourcing',
    },
    actor.id,
  );
});

afterAll(async () => {
  await account.cleanup();
});

describe('saveSdeCalc (integration)', () => {
  it('persists periods and lines and snapshots the weighted SDE 507676 through the stored path', async () => {
    const calcVersionId = await newCalcVersion('sde');

    await (saveSdeCalc as unknown as Action)(
      { calc_version_id: calcVersionId, periods: referenceSdePeriods() },
      actor,
    );

    const { data: periods } = await account.admin
      .from('sde_period')
      .select('id, weight, months')
      .eq('calc_version_id', calcVersionId);

    expect(periods).toHaveLength(3);

    const periodIds = (periods ?? []).map(
      (period: { id: string }) => period.id,
    );

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
        funding_sources: referenceFunding(),
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
        funding_sources: referenceFunding(),
      },
      actor,
    );

    await (adoptCalcVersion as unknown as Action)(
      { deal_id: dealId, calc_version_id: calcVersionId },
      actor,
    );

    const { data: financials } = await account.admin
      .from('deal_financials')
      .select(
        'deal_id, adopted_revenue, adopted_sde, adopted_ebitda, source_calc_version_id',
      )
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

  it('refuses to adopt a working-capital calc, which has nothing to adopt', async () => {
    const calcVersionId = await newCalcVersion('working_capital');
    await (saveWorkingCapitalCalc as unknown as Action)(
      {
        calc_version_id: calcVersionId,
        current_assets: 400_000,
        current_liabilities: 150_000,
        avg_monthly_revenue: 80_000,
      },
      actor,
    );

    expect(
      await (adoptCalcVersion as unknown as Action)(
        { deal_id: dealId, calc_version_id: calcVersionId },
        actor,
      ),
    ).toEqual({
      ok: false,
      refusal: 'This calc has nothing to adopt. Save a deal or SDE calc first.',
    });
  });

  it('refuses to adopt a calc that was never saved', async () => {
    const calcVersionId = await newCalcVersion('deal');

    expect(
      await (adoptCalcVersion as unknown as Action)(
        { deal_id: dealId, calc_version_id: calcVersionId },
        actor,
      ),
    ).toEqual({
      ok: false,
      refusal: 'This calc has nothing to adopt. Save a deal or SDE calc first.',
    });
  });

  it('refuses to adopt a calc from another deal into this one', async () => {
    const calcVersionId = await newCalcVersion('deal');
    await (saveDealCalc as unknown as Action)(
      {
        calc_version_id: calcVersionId,
        inputs: referenceDealInputs,
        funding_sources: referenceFunding(),
      },
      actor,
    );
    const otherDealId = await createDealCore(
      account.user,
      {
        account_id: account.accountId,
        business_name: 'Other calculator deal',
        industry: 'Accounting',
        description: 'Other calculator deal',
        source: 'manual',
        stage: 'sourcing',
      },
      actor.id,
    );

    const result = await (adoptCalcVersion as unknown as Action)(
      { deal_id: otherDealId, calc_version_id: calcVersionId },
      actor,
    );
    const { data: financials } = await account.admin
      .from('deal_financials')
      .select('deal_id')
      .eq('deal_id', otherDealId);

    expect(result).toEqual({
      ok: false,
      refusal: 'That calc belongs to another deal.',
    });
    expect(financials).toEqual([]);
  });

  it('refuses a team member without deal-manager rights with a named reason', async () => {
    const calcVersionId = await newCalcVersion('deal');
    await (saveDealCalc as unknown as Action)(
      {
        calc_version_id: calcVersionId,
        inputs: referenceDealInputs,
        funding_sources: referenceFunding(),
      },
      actor,
    );
    await account.admin
      .from('accounts')
      .update({ name: 'Morgan Reyes' })
      .eq('primary_owner_user_id', account.userId)
      .eq('is_personal_account', true)
      .throwOnError();
    const member = await signedInMember('member');
    holder.client = member;

    const result = await (adoptCalcVersion as unknown as Action)(
      { deal_id: dealId, calc_version_id: calcVersionId },
      actor,
    );
    holder.client = account.user;

    expect(result).toEqual({
      ok: false,
      refusal: 'Only deal managers can adopt financials. Ask Morgan Reyes.',
    });
  });
});

describe('saveDealCalc refusal (integration)', () => {
  it('tells a read-only member they cannot save calculators', async () => {
    const calcVersionId = await newCalcVersion('deal');
    holder.client = await signedInMember('viewer');

    const result = await (saveDealCalc as unknown as Action)(
      {
        calc_version_id: calcVersionId,
        inputs: referenceDealInputs,
        funding_sources: referenceFunding(),
      },
      actor,
    );
    holder.client = account.user;

    expect(result).toEqual({
      ok: false,
      refusal: "Read-only members can't save calculators. Ask a deal manager.",
    });
  });
});

describe('createCalcVersion refusal (integration)', () => {
  it('tells a read-only member they cannot create calculators', async () => {
    holder.client = await signedInMember('viewer');

    const result = await (createCalcVersion as unknown as Action)(
      { deal_id: dealId, type: 'sde' },
      actor,
    );
    holder.client = account.user;

    expect(result).toEqual({
      ok: false,
      refusal:
        "Read-only members can't create calculators. Ask a deal manager.",
    });
  });
});

async function signedInMember(role: 'member' | 'viewer') {
  const unique = crypto.randomUUID().slice(0, 8);
  const email = `int-member-${unique}@odb.test`;
  const password = `Pw-${unique}-Aa1!`;
  const { data } = await account.admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  await account.admin
    .from('accounts_memberships')
    .insert({
      account_id: account.accountId,
      user_id: data.user!.id,
      account_role: role,
    })
    .throwOnError();
  const member = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321',
    (account.user as unknown as { supabaseKey: string }).supabaseKey,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  await member.auth.signInWithPassword({ email, password });
  return member;
}
