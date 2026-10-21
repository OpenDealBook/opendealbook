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
  deriveBuyerEquity,
  dscrSensitivity,
  ebitda,
  netIncome,
  paybackYears,
  purchaseMultiple,
  recastPeriod,
  sdeFromPl,
  scenarioPaths,
  sdePeriodsSchema,
  tenYearProForma,
  threeYearProjection,
  weightedSde,
  workingCapital,
} from '@odb/calculators';
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
import { figuresToAdopt, outputsSaved } from '../shared/adopted-figures';
import { adoptDealFinancialsCore } from './deal-actions';
import { Refusal, refusableAction } from './refusal';

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
      minor.custom.push({
        label: line.custom_label ?? '',
        amount: line.amount,
      });
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

function partitionById<Row extends { id: string }>(
  savedIds: string[],
  rows: Row[],
): { removed: string[]; existing: Row[]; fresh: Row[] } {
  const saved = new Set(savedIds);
  const kept = new Set(rows.map((row) => row.id));

  return {
    removed: savedIds.filter((id) => !kept.has(id)),
    existing: rows.filter((row) => saved.has(row.id)),
    fresh: rows.filter((row) => !saved.has(row.id)),
  };
}

export const createCalcVersion = refusableAction(
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
  createCalcVersionSchema,
  { what: 'create calculators', needs: 'deals.work' },
);

export const saveSdeCalc = refusableAction(
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
          id: period.id,
          account_id,
          calc_version_id: data.calc_version_id,
          label: period.label ?? null,
          weight: period.weight,
          months: period.months ?? null,
        },
      };
    });

    const sdePeriods = sdePeriodsSchema.parse(prepared.map((p) => p.sdePeriod));

    const { data: savedPeriods } = await client
      .from('sde_period')
      .select('id')
      .eq('calc_version_id', data.calc_version_id)
      .throwOnError();
    const periods = partitionById(
      savedPeriods.map((period) => period.id),
      prepared.map((p) => p.row),
    );
    await client
      .from('sde_period')
      .delete()
      .in('id', periods.removed)
      .throwOnError();
    await client.from('sde_period').upsert(periods.existing).throwOnError();
    await client
      .from('sde_period')
      .insert(
        periods.fresh.map((period) => ({ ...period, created_by: user.id })),
      )
      .throwOnError();

    const { data: savedLines } = await client
      .from('sde_line')
      .select('id, line_code')
      .in(
        'period_id',
        prepared.map((p) => p.row.id),
      )
      .throwOnError();
    const customLines = prepared.flatMap(({ period, row }) =>
      period.lines.flatMap((line) =>
        line.line_code === 'custom'
          ? [
              {
                id: line.id,
                account_id,
                period_id: row.id,
                line_code: line.line_code,
                custom_label: line.custom_label,
                amount: line.amount,
              },
            ]
          : [],
      ),
    );
    const keptCustom = new Set(customLines.map((line) => line.id));

    await client
      .from('sde_line')
      .delete()
      .in(
        'id',
        savedLines
          .filter(
            (line) => line.line_code !== 'custom' || !keptCustom.has(line.id),
          )
          .map((line) => line.id),
      )
      .throwOnError();

    const savedIds = new Set(savedLines.map((line) => line.id));
    await client
      .from('sde_line')
      .upsert(customLines.filter((line) => savedIds.has(line.id)))
      .throwOnError();
    await client
      .from('sde_line')
      .insert([
        ...customLines
          .filter((line) => !savedIds.has(line.id))
          .map((line) => ({ ...line, created_by: user.id })),
        ...prepared.flatMap(({ period, row }) =>
          period.lines.flatMap((line) =>
            line.line_code === 'custom'
              ? []
              : [
                  {
                    id: crypto.randomUUID(),
                    account_id,
                    period_id: row.id,
                    line_code: line.line_code,
                    custom_label: null,
                    amount: line.amount,
                    created_by: user.id,
                  },
                ],
          ),
        ),
      ])
      .throwOnError();

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

    await writeSnapshot(
      client,
      data.calc_version_id,
      snapshot as unknown as Json,
    );

    return { success: true };
  },
  saveSdeCalcSchema,
  { what: 'save calculators', needs: 'deals.work' },
);

export const saveDealCalc = refusableAction(
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

    const { data: savedFunding } = await client
      .from('funding_source')
      .select('id')
      .eq('calc_version_id', data.calc_version_id)
      .throwOnError();
    const fundingRows = partitionById(
      savedFunding.map((source) => source.id),
      data.funding_sources.map((source) => ({
        id: source.id,
        account_id,
        calc_version_id: data.calc_version_id,
        type: source.type,
        amount: source.amount,
        pct: source.pct ?? null,
        rate: source.rate ?? null,
        term_years: source.term_years ?? null,
        guarantee_fee: source.guarantee_fee ?? null,
        standby_months: source.standby_months ?? null,
        after_standby: source.after_standby ?? null,
        notes: source.notes ?? null,
      })),
    );
    await client
      .from('funding_source')
      .delete()
      .in('id', fundingRows.removed)
      .throwOnError();
    await client
      .from('funding_source')
      .upsert(fundingRows.existing)
      .throwOnError();
    await client
      .from('funding_source')
      .insert(
        fundingRows.fresh.map((source) => ({ ...source, created_by: user.id })),
      )
      .throwOnError();

    const pl: ProfitAndLoss = data.inputs.pl;
    const funding = data.funding_sources as FundingSource[];
    const options = dscrOptions(data.inputs);

    const sde = sdeFromPl(pl);
    const projection = {
      sde,
      annualGrowth: data.inputs.annual_growth,
      sources: funding,
      dscrOptions: options,
      basis: data.inputs.year_basis ?? { kind: 'months_from_close' as const },
    };
    const years = threeYearProjection(projection);
    const debtService = years[0].debt_service;
    const ncf = years[0].net_cash_flow;
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
      dscr: years[0].dscr,
      years,
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
      pro_forma: tenYearProForma(projection),
      scenario_paths: data.inputs.scenario_paths
        ? scenarioPaths({
            ...projection,
            sales: pl.sales,
            minimumDscr: data.inputs.reference_line ?? 1.25,
            drivers: data.inputs.scenario_paths,
          })
        : null,
      dscr_sensitivity: dscrSensitivity(
        sde,
        debtService,
        options,
        data.inputs.reference_line,
      ),
      adopt: {
        revenue: pl.sales,
        sde,
        ebitda: ebitda(pl),
        years: years.map((year) => ({
          year: year.year,
          debt_service: year.debt_service,
          dscr: year.dscr,
          net_cash_flow: year.net_cash_flow,
        })),
      },
    };

    await writeSnapshot(
      client,
      data.calc_version_id,
      snapshot as unknown as Json,
    );

    return { success: true };
  },
  saveDealCalcSchema,
  { what: 'save calculators', needs: 'deals.work' },
);

export const saveWorkingCapitalCalc = refusableAction(
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

    await writeSnapshot(
      client,
      data.calc_version_id,
      snapshot as unknown as Json,
    );

    return { success: true };
  },
  saveWorkingCapitalCalcSchema,
  { what: 'save calculators', needs: 'deals.work' },
);

export const duplicateCalcVersion = refusableAction(
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

    const copies = new Map<string, string>();
    const copyOf = (id: string) => {
      const copy = crypto.randomUUID();
      copies.set(id, copy);
      return copy;
    };

    const { data: periods } = await client
      .from('sde_period')
      .select('*, sde_line(*)')
      .eq('calc_version_id', data.calc_version_id)
      .throwOnError();

    const periodCopies = (periods ?? []).map((period) => ({
      source: period,
      row: {
        id: copyOf(period.id),
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
          id: copyOf(line.id),
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
            id: copyOf(source_row.id),
            account_id: source.account_id,
            calc_version_id: newId,
            type: source_row.type,
            amount: source_row.amount,
            pct: source_row.pct,
            rate: source_row.rate,
            term_years: source_row.term_years,
            guarantee_fee: source_row.guarantee_fee,
            standby_months: source_row.standby_months,
            after_standby: source_row.after_standby,
            notes: source_row.notes,
            created_by: user.id,
          })),
        )
        .throwOnError();
    }

    const { data: citations } = await client
      .from('calc_input_citation')
      .select('*')
      .eq('calc_version_id', data.calc_version_id)
      .order('created_at')
      .throwOnError();

    await client
      .from('calc_input_citation')
      .insert(
        citations.map((citation) => ({
          account_id: citation.account_id,
          calc_version_id: newId,
          row_id:
            citation.row_id === null ? null : copies.get(citation.row_id)!,
          input_key: citation.input_key,
          dr_document_id: citation.dr_document_id,
          document_name: citation.document_name,
          document_version: citation.document_version,
          page: citation.page,
          sheet: citation.sheet,
          cell: citation.cell,
        })),
      )
      .throwOnError();

    return newId;
  },
  calcVersionIdSchema,
  { what: 'duplicate calculators', needs: 'deals.work' },
);

export const deleteCalcVersion = refusableAction(
  async (data) => {
    const client = getSupabaseServerClient();

    await client
      .from('calc_version')
      .delete()
      .eq('id', data.calc_version_id)
      .throwOnError();

    return { success: true };
  },
  calcVersionIdSchema,
  { what: 'delete calculators', needs: 'deals.manage' },
);

export const markPrimaryCalcVersion = refusableAction(
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
  calcVersionIdSchema,
  { what: 'choose the primary calculator', needs: 'deals.work' },
);

export const adoptCalcVersion = refusableAction(
  async (data) => {
    const client = getSupabaseServerClient();

    const { data: version } = await client
      .from('calc_version')
      .select('deal_id, type, outputs_snapshot')
      .eq('id', data.calc_version_id)
      .single()
      .throwOnError();

    if (version.deal_id !== data.deal_id) {
      throw new Refusal('That calc belongs to another deal.');
    }

    if (
      version.type === 'working_capital' ||
      !outputsSaved(version.outputs_snapshot)
    ) {
      throw new Refusal(
        'This calc has nothing to adopt. Save a deal or SDE calc first.',
      );
    }

    const figures = figuresToAdopt(version.outputs_snapshot);

    await adoptDealFinancialsCore(client, {
      deal_id: data.deal_id,
      source_calc_version_id: data.calc_version_id,
      adopted_revenue: figures.revenue ?? undefined,
      adopted_sde: figures.sde ?? undefined,
      adopted_ebitda: figures.ebitda ?? undefined,
      adopted_years: figures.years ?? undefined,
    });

    return { success: true };
  },
  adoptCalcVersionSchema,
  {
    what: 'adopt financials',
    needs: 'deals.manage',
    dealId: (data) => data.deal_id,
  },
);
