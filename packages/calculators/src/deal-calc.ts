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

export function debtServiceYear1(sources: FundingSource[]): number {
  return sources.reduce((total, source) => {
    if (source.rate == null || source.term_years == null) {
      return total;
    }
    const standbyMonths = source.standby_months ?? 0;
    if (standbyMonths >= 12) {
      return total;
    }
    const balanceAfterStandby =
      source.amount * Math.pow(1 + source.rate / 12, standbyMonths);
    const monthly = amortizeMonthlyPayment(
      balanceAfterStandby,
      source.rate,
      source.term_years * 12,
    );
    return total + monthly * (12 - standbyMonths);
  }, 0);
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

export function proForma(
  sde: number,
  annualGrowth: number,
  debtService: number,
  years = 10,
): number[] {
  return Array.from(
    { length: years },
    (_, index) => sde * Math.pow(1 + annualGrowth, index) - debtService,
  );
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
