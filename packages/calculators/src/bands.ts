import {
  amortizeMonthlyPayment,
  cashOnCash,
  dealBoxGap,
  deriveBuyerEquity,
  dscr,
  netCashFlow,
  proForma,
  purchaseMultiple,
  type DscrMode,
} from './deal-calc';
import type { FundingSource } from './funding-source';

export type Assumption<T = number> =
  | { kind: 'scalar'; value: T }
  | { kind: 'band'; min: T; base: T; max: T }
  | { kind: 'sweep'; from: T; to: T; steps: number };

export const scalar = (value: number): Assumption => ({ kind: 'scalar', value });

export const band = (min: number, base: number, max: number): Assumption => ({
  kind: 'band',
  min,
  base,
  max,
});

export const sweep = (from: number, to: number, steps: number): Assumption => ({
  kind: 'sweep',
  from,
  to,
  steps,
});

export function expandAssumption(assumption: Assumption): number[] {
  switch (assumption.kind) {
    case 'scalar':
      return [assumption.value];
    case 'band':
      return [assumption.min, assumption.base, assumption.max];
    case 'sweep':
      if (assumption.steps <= 1) {
        return [assumption.from];
      }
      return Array.from(
        { length: assumption.steps },
        (_, index) =>
          assumption.from +
          ((assumption.to - assumption.from) * index) / (assumption.steps - 1),
      );
  }
}

export function baseOf(assumption: Assumption): number {
  switch (assumption.kind) {
    case 'scalar':
      return assumption.value;
    case 'band':
      return assumption.base;
    case 'sweep':
      return (assumption.from + assumption.to) / 2;
  }
}

export type DealDriver =
  | 'sde'
  | 'annual_growth'
  | 'interest_rate'
  | 'dscr_tax_rate'
  | 'purchase_price';

export interface DealAssumptions {
  sde: Assumption;
  annual_growth: Assumption;
  interest_rate: Assumption;
  dscr_tax_rate: Assumption;
  purchase_price: Assumption;
  loan_principal: number;
  loan_term_months: number;
  closing_costs: number;
  buyer_equity?: number;
  funding_sources?: FundingSource[];
  working_capital?: number;
  required_personal_cash_flow: number;
  dscr_mode?: DscrMode;
}

export interface DealOutputs {
  dscr: number | null;
  net_cash_flow: number;
  cash_on_cash: number | null;
  deal_box_gap: number;
  purchase_multiple: number | null;
}

export interface DealBandPoint {
  driverValue: number;
  outputs: DealOutputs;
}

export interface ScenarioBand {
  low: DealOutputs;
  base: DealOutputs;
  high: DealOutputs;
}

type DriverValues = Record<DealDriver, number>;

function debtService(inputs: DealAssumptions, interestRate: number): number {
  return (
    amortizeMonthlyPayment(
      inputs.loan_principal,
      interestRate,
      inputs.loan_term_months,
    ) * 12
  );
}

function equityFor(inputs: DealAssumptions): number {
  if (inputs.buyer_equity != null) {
    return inputs.buyer_equity;
  }
  return deriveBuyerEquity({
    purchase_price: baseOf(inputs.purchase_price),
    closing_costs: inputs.closing_costs,
    working_capital: inputs.working_capital,
    funding_sources: inputs.funding_sources ?? [],
  });
}

function outputsFor(
  inputs: DealAssumptions,
  drivers: DriverValues,
): DealOutputs {
  const service = debtService(inputs, drivers.interest_rate);
  const cashFlow = netCashFlow(drivers.sde, service);
  return {
    dscr: dscr(drivers.sde, service, {
      mode: inputs.dscr_mode,
      taxRate: drivers.dscr_tax_rate,
    }),
    net_cash_flow: cashFlow,
    cash_on_cash: cashOnCash(cashFlow, equityFor(inputs)),
    deal_box_gap: dealBoxGap(cashFlow, inputs.required_personal_cash_flow),
    purchase_multiple: purchaseMultiple(
      drivers.purchase_price,
      inputs.closing_costs,
      drivers.sde,
    ),
  };
}

function baseDrivers(inputs: DealAssumptions): DriverValues {
  return {
    sde: baseOf(inputs.sde),
    annual_growth: baseOf(inputs.annual_growth),
    interest_rate: baseOf(inputs.interest_rate),
    dscr_tax_rate: baseOf(inputs.dscr_tax_rate),
    purchase_price: baseOf(inputs.purchase_price),
  };
}

export function computeDealPoint(inputs: DealAssumptions): DealOutputs {
  return outputsFor(inputs, baseDrivers(inputs));
}

export function computeDealBand(
  inputs: DealAssumptions,
  driver: DealDriver,
  range: Assumption,
): DealBandPoint[] {
  const base = baseDrivers(inputs);
  return expandAssumption(range).map((driverValue) => ({
    driverValue,
    outputs: outputsFor(inputs, { ...base, [driver]: driverValue }),
  }));
}

const lowValue = (assumption: Assumption): number =>
  Math.min(...expandAssumption(assumption));

const highValue = (assumption: Assumption): number =>
  Math.max(...expandAssumption(assumption));

export function computeScenarioBand(inputs: DealAssumptions): ScenarioBand {
  const worst: DriverValues = {
    sde: lowValue(inputs.sde),
    annual_growth: lowValue(inputs.annual_growth),
    interest_rate: highValue(inputs.interest_rate),
    dscr_tax_rate: highValue(inputs.dscr_tax_rate),
    purchase_price: highValue(inputs.purchase_price),
  };
  const best: DriverValues = {
    sde: highValue(inputs.sde),
    annual_growth: highValue(inputs.annual_growth),
    interest_rate: lowValue(inputs.interest_rate),
    dscr_tax_rate: lowValue(inputs.dscr_tax_rate),
    purchase_price: lowValue(inputs.purchase_price),
  };
  return {
    low: outputsFor(inputs, worst),
    base: outputsFor(inputs, baseDrivers(inputs)),
    high: outputsFor(inputs, best),
  };
}

export function computeDealProjection(
  inputs: DealAssumptions,
  years = 10,
): number[] {
  const drivers = baseDrivers(inputs);
  return proForma(
    drivers.sde,
    drivers.annual_growth,
    debtService(inputs, drivers.interest_rate),
    years,
  );
}
