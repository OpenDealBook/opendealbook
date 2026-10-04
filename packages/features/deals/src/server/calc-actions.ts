'use server';

import {
  type DscrOptions,
  type FundingSource,
  type MinorAddbacks,
  type PrimaryAddbacks,
  type ProfitAndLoss,
  type SdePeriod,
  annualizeSde,
  cashOnCash,
  dealBoxGap,
  debtServiceYear1,
  deriveBuyerEquity,
  dscr,
  dscrSensitivity,
  ebitda,
  netCashFlow,
  netIncome,
  paybackYears,
  proForma,
  purchaseMultiple,
  recastPeriod,
  sdeFromPl,
  sdePeriodsSchema,
  weightedSde,
  workingCapital,
} from '@odb/calculators';
import { enhanceAction } from '@odb/next/actions';
import type { Json } from '@odb/supabase';
import { getSupabaseServerClient } from '@odb/supabase/server';

import {
  adoptCalcVersionSchema,
  calcVersionIdSchema,
  createCalcVersionSchema,
  type DealCalcInputs,
  type SaveSdeCalcPayload,
  saveDealCalcSchema,
  saveSdeCalcSchema,
  saveWorkingCapitalCalcSchema,
} from '../schema/calc.schema';
import { adoptDealFinancials } from './deal-actions';

type Client = ReturnType<typeof getSupabaseServerClient>;

const PRIMARY_CODES: ReadonlySet<keyof PrimaryAddbacks> = new Set([
  'depreciation_amortization',
  'interest',
  'taxes',
  'owner_salary',
  'owner_payroll_taxes',
]);

function emptyPrimary(): PrimaryAddbacks {
  return {
    depreciation_amortization: 0,
    interest: 0,
    taxes: 0,
    owner_salary: 0,
    owner_payroll_taxes: 0,
  };
}

function emptyMinor(): MinorAddbacks {
  return {
    non_working_family_salaries: 0,
    other_owner_salary_adjustments: 0,
    other_owner_payroll_taxes: 0,
    owner_auto_insurance_repairs: 0,
    donations: 0,
    fmv_rent_adjustment: 0,
    owner_insurance_premiums: 0,
    non_business_professional_services: 0,
    travel: 0,
    telephone: 0,
    maintenance_capex: 0,
    one_time_charges_or_income: 0,
    custom: [],
  };
}

function toSdePeriod(period: SaveSdeCalcPayload['periods'][number]): SdePeriod {
  const primary = emptyPrimary();
  const minor = emptyMinor();
  let sales = 0;
  let cogs = 0;
  let opex = 0;

  for (const line of period.lines) {
    if (line.line_code === 'sales') {
      sales += line.amount;
    } else if (line.line_code === 'cogs') {
      cogs += line.amount;
    } else if (line.line_code === 'opex') {
      opex += line.amount;
    } else if (line.line_code === 'custom') {
      minor.custom.push({ label: line.custom_label ?? '', amount: line.amount });
    } else if (PRIMARY_CODES.has(line.line_code as keyof PrimaryAddbacks)) {
      primary[line.line_code as keyof PrimaryAddbacks] += line.amount;
    } else {
      minor[line.line_code as Exclude<keyof MinorAddbacks, 'custom'>] +=
        line.amount;
    }
  }

  return {
    weight: period.weight,
    months: period.months ?? null,
    sales,
    cogs,
    opex,
    primary,
    minor,
  };
}

function dscrOptions(inputs: DealCalcInputs): DscrOptions {
  const options: DscrOptions = {};
  if (inputs.dscr_mode) {
    options.mode = inputs.dscr_mode;
  }
  if (inputs.tax_rate != null) {
    options.taxRate = inputs.tax_rate;
  }
  if (inputs.owner_salary != null) {
    options.ownerSalary = inputs.owner_salary;
  }
  return options;
}

async function calcVersionContext(
  client: Client,
  calcVersionId: string,
): Promise<{ account_id: string; deal_id: string; type: string | null }> {
  const { data } = await client
    .from('calc_version')
    .select('account_id, deal_id, type')
    .eq('id', calcVersionId)
    .single()
    .throwOnError();

  return data;
}

async function writeSnapshot(
  client: Client,
  calcVersionId: string,
  snapshot: Json,
): Promise<void> {
  await client
    .from('calc_version')
    .update({ outputs_snapshot: snapshot })
    .eq('id', calcVersionId)
    .throwOnError();
}

export const createCalcVersion = enhanceAction(
  async (data, user) => {
    const client = getSupabaseServerClient();
    const id = crypto.randomUUID();

    const { data: deal } = await client
      .from('deal')
      .select('account_id')
      .eq('id', data.deal_id)
      .single()
      .throwOnError();

    await client
      .from('calc_version')
      .insert({
        id,
        account_id: deal.account_id,
        deal_id: data.deal_id,
        type: data.type,
        name: data.name ?? null,
        notes: data.notes ?? null,
        created_by: user.id,
      })
      .throwOnError();

    return id;
  },
  { auth: true, schema: createCalcVersionSchema },
);

export const saveSdeCalc = enhanceAction(
  async (data, user) => {
    const client = getSupabaseServerClient();
    const { account_id } = await calcVersionContext(
      client,
      data.calc_version_id,
    );

    const prepared = data.periods.map((period) => {
      const sdePeriod = toSdePeriod(period);
      return {
        period,
        sdePeriod,
        recast: recastPeriod(sdePeriod),
        row: {
          id: crypto.randomUUID(),
          account_id,
          calc_version_id: data.calc_version_id,
          label: period.label ?? null,
          weight: period.weight,
          months: period.months ?? null,
          created_by: user.id,
        },
      };
    });

    const sdePeriods = sdePeriodsSchema.parse(prepared.map((p) => p.sdePeriod));

    await client
      .from('sde_period')
      .delete()
      .eq('calc_version_id', data.calc_version_id)
      .throwOnError();

    await client
      .from('sde_period')
      .insert(prepared.map((p) => p.row))
      .throwOnError();

    const lineRows = prepared.flatMap(({ period, row }) =>
      period.lines.map((line) => ({
        account_id,
        period_id: row.id,
        line_code: line.line_code,
        custom_label: line.custom_label ?? null,
        amount: line.amount,
        created_by: user.id,
      })),
    );

    if (lineRows.length > 0) {
      await client.from('sde_line').insert(lineRows).throwOnError();
    }

    const weighted = weightedSde(sdePeriods);
    const recent = sdePeriods[sdePeriods.length - 1]!;
    const recentEbitda = annualizeSde(
      ebitda({
        sales: recent.sales,
        cogs: recent.cogs,
        opex: recent.opex,
        depreciation_amortization: recent.primary.depreciation_amortization,
        taxes: recent.primary.taxes,
        interest: recent.primary.interest,
        owner_benefits: 0,
      }),
      recent.months,
    );

    const snapshot = {
      type: 'sde',
      weighted_sde: weighted,
      periods: prepared.map(({ period, recast }) => ({
        label: period.label ?? null,
        weight: period.weight,
        months: period.months ?? null,
        net_income: recast.net_income,
        basic_discretionary_earnings: recast.basic_discretionary_earnings,
        total_sde: recast.total_sde,
        annualized_sde: recast.annualized_sde,
        margin: recast.margin,
      })),
      adopt: { revenue: null, sde: weighted, ebitda: recentEbitda },
    };

    await writeSnapshot(client, data.calc_version_id, snapshot as unknown as Json);

    return { success: true };
  },
  { auth: true, schema: saveSdeCalcSchema },
);

export const saveDealCalc = enhanceAction(
  async (data, user) => {
    const client = getSupabaseServerClient();
    const { account_id } = await calcVersionContext(
      client,
      data.calc_version_id,
    );

    await client
      .from('deal_calc_input')
      .upsert(
        {
          account_id,
          calc_version_id: data.calc_version_id,
          inputs: data.inputs as unknown as Json,
          deal_box_id: data.deal_box_id ?? null,
          imported_from_version_id: data.imported_from_version_id ?? null,
          created_by: user.id,
        },
        { onConflict: 'calc_version_id' },
      )
      .throwOnError();

    await client
      .from('funding_source')
      .delete()
      .eq('calc_version_id', data.calc_version_id)
      .throwOnError();

    if (data.funding_sources.length > 0) {
      await client
        .from('funding_source')
        .insert(
          data.funding_sources.map((source) => ({
            account_id,
            calc_version_id: data.calc_version_id,
            type: source.type,
            amount: source.amount,
            pct: source.pct ?? null,
            rate: source.rate ?? null,
            term_years: source.term_years ?? null,
            guarantee_fee: source.guarantee_fee ?? null,
            standby_months: source.standby_months ?? null,
            notes: source.notes ?? null,
            created_by: user.id,
          })),
        )
        .throwOnError();
    }

    const pl: ProfitAndLoss = data.inputs.pl;
    const funding = data.funding_sources as FundingSource[];
    const options = dscrOptions(data.inputs);

    const sde = sdeFromPl(pl);
    const debtService = debtServiceYear1(funding);
    const ncf = netCashFlow(sde, debtService);
    const buyerEquity =
      data.inputs.buyer_equity ??
      deriveBuyerEquity({
        purchase_price: data.inputs.purchase_price,
        closing_costs: data.inputs.closing_costs,
        working_capital: data.inputs.working_capital,
        funding_sources: funding,
      });

    const snapshot = {
      type: 'deal',
      net_income: netIncome(pl),
      sde,
      debt_service_yr1: debtService,
      dscr: dscr(sde, debtService, options),
      purchase_multiple: purchaseMultiple(
        data.inputs.purchase_price,
        data.inputs.closing_costs,
        sde,
      ),
      net_cash_flow: ncf,
      buyer_equity: buyerEquity,
      cash_on_cash: cashOnCash(ncf, buyerEquity),
      payback_years: paybackYears(buyerEquity, ncf),
      deal_box_gap: dealBoxGap(ncf, data.inputs.required_personal_cash_flow),
      pro_forma: proForma(sde, data.inputs.annual_growth, debtService),
      dscr_sensitivity: dscrSensitivity(
        sde,
        debtService,
        options,
        data.inputs.reference_line,
      ),
      adopt: { revenue: pl.sales, sde, ebitda: ebitda(pl) },
    };

    await writeSnapshot(client, data.calc_version_id, snapshot as unknown as Json);

    return { success: true };
  },
  { auth: true, schema: saveDealCalcSchema },
);

export const saveWorkingCapitalCalc = enhanceAction(
  async (data, user) => {
    const client = getSupabaseServerClient();
    const { account_id } = await calcVersionContext(
      client,
      data.calc_version_id,
    );

    const inputs = {
      current_assets: data.current_assets,
      current_liabilities: data.current_liabilities,
      avg_monthly_revenue: data.avg_monthly_revenue,
    };

    await client
      .from('deal_calc_input')
      .upsert(
        {
          account_id,
          calc_version_id: data.calc_version_id,
          inputs: inputs as unknown as Json,
          created_by: user.id,
        },
        { onConflict: 'calc_version_id' },
      )
      .throwOnError();

    const result = workingCapital(inputs);

    const snapshot = {
      type: 'working_capital',
      working_capital: result.working_capital,
      months_of_revenue_covered: result.months_of_revenue_covered,
    };

    await writeSnapshot(client, data.calc_version_id, snapshot as unknown as Json);

    return { success: true };
  },
  { auth: true, schema: saveWorkingCapitalCalcSchema },
);

export const duplicateCalcVersion = enhanceAction(
  async (data, user) => {
    const client = getSupabaseServerClient();
    const newId = crypto.randomUUID();

    const { data: source } = await client
      .from('calc_version')
      .select('*')
      .eq('id', data.calc_version_id)
      .single()
      .throwOnError();

    await client
      .from('calc_version')
      .insert({
        id: newId,
        account_id: source.account_id,
        deal_id: source.deal_id,
        type: source.type,
        name: `Copy of ${source.name ?? 'calculator'}`,
        notes: source.notes,
        is_primary: false,
        outputs_snapshot: source.outputs_snapshot,
        created_by: user.id,
      })
      .throwOnError();

    const { data: periods } = await client
      .from('sde_period')
      .select('*, sde_line(*)')
      .eq('calc_version_id', data.calc_version_id)
      .throwOnError();

    const periodCopies = (periods ?? []).map((period) => ({
      source: period,
      row: {
        id: crypto.randomUUID(),
        account_id: source.account_id,
        calc_version_id: newId,
        label: period.label,
        weight: period.weight,
        months: period.months,
        created_by: user.id,
      },
    }));

    if (periodCopies.length > 0) {
      await client
        .from('sde_period')
        .insert(periodCopies.map((copy) => copy.row))
        .throwOnError();

      const lineRows = periodCopies.flatMap((copy) =>
        (copy.source.sde_line ?? []).map((line) => ({
          account_id: source.account_id,
          period_id: copy.row.id,
          line_code: line.line_code,
          custom_label: line.custom_label,
          amount: line.amount,
          created_by: user.id,
        })),
      );

      if (lineRows.length > 0) {
        await client.from('sde_line').insert(lineRows).throwOnError();
      }
    }

    const { data: input } = await client
      .from('deal_calc_input')
      .select('*')
      .eq('calc_version_id', data.calc_version_id)
      .maybeSingle()
      .throwOnError();

    if (input) {
      await client
        .from('deal_calc_input')
        .insert({
          account_id: source.account_id,
          calc_version_id: newId,
          inputs: input.inputs,
          deal_box_id: input.deal_box_id,
          imported_from_version_id: input.imported_from_version_id,
          created_by: user.id,
        })
        .throwOnError();
    }

    const { data: funding } = await client
      .from('funding_source')
      .select('*')
      .eq('calc_version_id', data.calc_version_id)
      .throwOnError();

    if ((funding ?? []).length > 0) {
      await client
        .from('funding_source')
        .insert(
          (funding ?? []).map((source_row) => ({
            account_id: source.account_id,
            calc_version_id: newId,
            type: source_row.type,
            amount: source_row.amount,
            pct: source_row.pct,
            rate: source_row.rate,
            term_years: source_row.term_years,
            guarantee_fee: source_row.guarantee_fee,
            standby_months: source_row.standby_months,
            notes: source_row.notes,
            created_by: user.id,
          })),
        )
        .throwOnError();
    }

    return newId;
  },
  { auth: true, schema: calcVersionIdSchema },
);

export const deleteCalcVersion = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    await client
      .from('calc_version')
      .delete()
      .eq('id', data.calc_version_id)
      .throwOnError();

    return { success: true };
  },
  { auth: true, schema: calcVersionIdSchema },
);

export const markPrimaryCalcVersion = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();
    const { deal_id, type } = await calcVersionContext(
      client,
      data.calc_version_id,
    );

    await client
      .from('calc_version')
      .update({ is_primary: false })
      .eq('deal_id', deal_id)
      .eq('type', type as string)
      .throwOnError();

    await client
      .from('calc_version')
      .update({ is_primary: true })
      .eq('id', data.calc_version_id)
      .throwOnError();

    return { success: true };
  },
  { auth: true, schema: calcVersionIdSchema },
);

export const adoptCalcVersion = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    const { data: version } = await client
      .from('calc_version')
      .select('outputs_snapshot')
      .eq('id', data.calc_version_id)
      .single()
      .throwOnError();

    const snapshot = version.outputs_snapshot as {
      adopt?: { revenue?: number | null; sde?: number | null; ebitda?: number | null };
    } | null;
    const adopt = snapshot?.adopt ?? {};

    const payload: {
      deal_id: string;
      source_calc_version_id: string;
      adopted_revenue?: number;
      adopted_sde?: number;
      adopted_ebitda?: number;
    } = {
      deal_id: data.deal_id,
      source_calc_version_id: data.calc_version_id,
    };

    if (typeof adopt.revenue === 'number') {
      payload.adopted_revenue = adopt.revenue;
    }
    if (typeof adopt.sde === 'number') {
      payload.adopted_sde = adopt.sde;
    }
    if (typeof adopt.ebitda === 'number') {
      payload.adopted_ebitda = adopt.ebitda;
    }

    await adoptDealFinancials(payload);

    return { success: true };
  },
  { auth: true, schema: adoptCalcVersionSchema },
);
