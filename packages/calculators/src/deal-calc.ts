import { z } from 'zod';

import type { FundingSource, FundingSourceType } from './funding-source';

export type DscrMode = 'tax_adjusted' | 'sba_standard';

export interface ProfitAndLoss {
  sales: number;
  cogs: number;
  opex: number;
  depreciation_amortization: number;
  taxes: number;
  interest: number;
  owner_benefits: number;
}

export interface DscrOptions {
  mode?: DscrMode;
  taxRate?: number;
  ownerSalary?: number;
}

export interface ClosingCosts {
  include: boolean;
  total: number;
  amount_financed: number;
}

export interface DscrSensitivityPoint {
  scale: number;
  sde: number;
  dscr: number | null;
  meets_reference: boolean;
}

const SENSITIVITY_SCALES = [-0.5, -0.25, 0, 0.25, 0.5];

export function netIncome(pl: ProfitAndLoss): number {
  return pl.sales - pl.cogs - pl.opex;
}

export function sdeFromPl(pl: ProfitAndLoss): number {
  return (
    netIncome(pl) +
    pl.depreciation_amortization +
    pl.taxes +
    pl.interest +
    pl.owner_benefits
  );
}

export function ebitda(pl: ProfitAndLoss): number {
  return (
    netIncome(pl) + pl.depreciation_amortization + pl.interest + pl.taxes
  );
}

export function amortizeMonthlyPayment(
  principal: number,
  annualRate: number,
  termMonths: number,
): number {
  const monthlyRate = annualRate / 12;
  if (monthlyRate === 0) {
    return principal / termMonths;
  }
  return (
    (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -termMonths))
  );
}

export function financedPrincipal(
  baseLoan: number,
  closingCosts: ClosingCosts,
  financedFees = 0,
): number {
  const financedClosing = closingCosts.include ? closingCosts.amount_financed : 0;
  return baseLoan + financedClosing + financedFees;
}

export interface ProjectedYear {
  year: number;
  debt_service_by_source: number[];
  debt_service: number;
  sde: number;
  dscr: number | null;
  net_cash_flow: number;
}

export const yearBasisKindSchema = z.enum(['months_from_close', 'fiscal_year']);

export const yearBasisSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('months_from_close') }),
  z.object({
    kind: z.literal('fiscal_year'),
    close_date: z.iso.date(),
    fiscal_year_end_month: z.number().int().min(1).max(12),
  }),
]);

export type YearBasis = z.infer<typeof yearBasisSchema>;

const REVENUE_LOSS_RANGE =
  'Revenue lost at close must be between 0% and 100%.';

export const pathDriversSchema = z.object({
  revenue_loss: z
    .number()
    .min(0, REVENUE_LOSS_RANGE)
    .max(1, REVENUE_LOSS_RANGE),
  growth: z.number(),
  margin_change: z.number(),
  rate_shift: z.number(),
});

export type PathDrivers = z.infer<typeof pathDriversSchema>;

export const scenarioPathDriversSchema = z.object({
  worst: pathDriversSchema,
  great: pathDriversSchema,
});

export type ScenarioPathDrivers = z.infer<typeof scenarioPathDriversSchema>;

export interface ProjectionInputs {
  sde: number;
  annualGrowth: number;
  sources: FundingSource[];
  dscrOptions: DscrOptions;
  basis: YearBasis;
}

interface PaymentWindow {
  after: number;
  through: number;
}

function paymentWindow(basis: YearBasis, year: number): PaymentWindow {
  const yearOneMonths =
    basis.kind === 'months_from_close'
      ? 12
      : (basis.fiscal_year_end_month - Number(basis.close_date.slice(5, 7)) + 12) %
        12;
  if (year === 1) {
    return { after: 0, through: yearOneMonths };
  }
  return {
    after: yearOneMonths + 12 * (year - 2),
    through: yearOneMonths + 12 * (year - 1),
  };
}

function sourceDebtService(
  source: FundingSource,
  window: PaymentWindow,
): number {
  if (source.rate == null || source.term_years == null) {
    return 0;
  }
  const standbyMonths = source.standby_months ?? 0;
  const termMonths = source.term_years * 12;
  const paymentMonths =
    source.after_standby === 'remaining_term'
      ? termMonths - standbyMonths
      : termMonths;
  const monthsOwed =
    Math.min(window.through, standbyMonths + paymentMonths) -
    Math.max(window.after, standbyMonths);
  if (monthsOwed <= 0) {
    return 0;
  }
  const balanceAfterStandby =
    source.amount * Math.pow(1 + source.rate / 12, standbyMonths);
  return (
    amortizeMonthlyPayment(balanceAfterStandby, source.rate, paymentMonths) *
    monthsOwed
  );
}

export function shiftRates(
  sources: FundingSource[],
  shift: number,
): FundingSource[] {
  return sources.map((source) =>
    source.rate == null
      ? source
      : { ...source, rate: Math.max(0, source.rate + shift) },
  );
}

export function projectYear(
  inputs: ProjectionInputs,
  year: number,
): ProjectedYear {
  const window = paymentWindow(inputs.basis, year);
  const bySource = inputs.sources.map((source) =>
    sourceDebtService(source, window),
  );
  const debtService = bySource.reduce((sum, amount) => sum + amount, 0);
  const grownSde = inputs.sde * Math.pow(1 + inputs.annualGrowth, year - 1);
  return {
    year,
    debt_service_by_source: bySource,
    debt_service: debtService,
    sde: grownSde,
    dscr: dscr(grownSde, debtService, inputs.dscrOptions),
    net_cash_flow: netCashFlow(grownSde, debtService),
  };
}

export function threeYearProjection(
  inputs: ProjectionInputs,
): [ProjectedYear, ProjectedYear, ProjectedYear] {
  return [
    projectYear(inputs, 1),
    projectYear(inputs, 2),
    projectYear(inputs, 3),
  ];
}

export function tenYearProForma(inputs: ProjectionInputs): number[] {
  return Array.from(
    { length: 10 },
    (_, index) => projectYear(inputs, index + 1).net_cash_flow,
  );
}

const DEBT_FUNDING_TYPES: ReadonlySet<FundingSourceType> = new Set([
  'sba_7a',
  'sba_504',
  'conventional',
  'seller_financing',
  'heloc',
  'mezzanine',
  'other',
]);

export interface BuyerEquityInputs {
  purchase_price: number;
  closing_costs: number;
  working_capital?: number;
  funding_sources: FundingSource[];
}

export function deriveBuyerEquity(inputs: BuyerEquityInputs): number {
  const totalUses =
    inputs.purchase_price +
    inputs.closing_costs +
    (inputs.working_capital ?? 0);
  const totalDebt = inputs.funding_sources
    .filter((source) => DEBT_FUNDING_TYPES.has(source.type))
    .reduce((sum, source) => sum + source.amount, 0);
  return totalUses - totalDebt;
}

export function dscr(
  sde: number,
  debtService: number,
  options: DscrOptions = {},
): number | null {
  if (debtService === 0) {
    return null;
  }
  if (options.mode === 'sba_standard') {
    return (sde - (options.ownerSalary ?? 0)) / debtService;
  }
  return (sde - (options.taxRate ?? 0) * (sde - debtService)) / debtService;
}

export function netCashFlow(sde: number, debtService: number): number {
  return sde - debtService;
}

export function purchaseMultiple(
  purchasePrice: number,
  closingCosts: number,
  sde: number,
): number | null {
  if (sde === 0) {
    return null;
  }
  return (purchasePrice + closingCosts) / sde;
}

export function revenueDropBeforeUnderwater(
  netCashFlowYr1: number,
  sales: number,
): number | null {
  if (sales === 0 || netCashFlowYr1 <= 0) {
    return null;
  }
  return netCashFlowYr1 / sales;
}

export function cashOnCash(
  netCashFlowYr1: number,
  buyerEquity: number,
): number | null {
  if (buyerEquity === 0) {
    return null;
  }
  return netCashFlowYr1 / buyerEquity;
}

export function paybackYears(
  buyerEquity: number,
  netCashFlowYr1: number,
): number | null {
  if (netCashFlowYr1 <= 0) {
    return null;
  }
  return Math.ceil(buyerEquity / netCashFlowYr1);
}

export function dealBoxGap(
  netCashFlowYr1: number,
  requiredPersonalCashFlow: number,
): number {
  return netCashFlowYr1 - requiredPersonalCashFlow;
}

export function dscrSensitivity(
  sde: number,
  debtService: number,
  options: DscrOptions = {},
  referenceLine = 1.25,
): DscrSensitivityPoint[] {
  return SENSITIVITY_SCALES.map((scale) => {
    const scaledSde = sde * (1 + scale);
    const value = dscr(scaledSde, debtService, options);
    return {
      scale,
      sde: scaledSde,
      dscr: value,
      meets_reference: value != null && value >= referenceLine,
    };
  });
}
