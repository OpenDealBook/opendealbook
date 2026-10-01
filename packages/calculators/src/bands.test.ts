import { describe, expect, it } from 'vitest';

import {
  amortizeMonthlyPayment,
  cashOnCash,
  dealBoxGap,
  dscr,
  dscrSensitivity,
  netCashFlow,
  proForma,
  purchaseMultiple,
} from './deal-calc';
import type { FundingSource } from './funding-source';
import {
  band,
  baseOf,
  computeDealBand,
  computeDealPoint,
  computeDealProjection,
  computeScenarioBand,
  expandAssumption,
  scalar,
  sweep,
  type DealAssumptions,
} from './bands';

const referenceInputs: DealAssumptions = {
  sde: scalar(163_000),
  annual_growth: scalar(0.1),
  interest_rate: scalar(0.115),
  dscr_tax_rate: scalar(0.2564),
  purchase_price: scalar(619_150),
  loan_principal: 552_150,
  loan_term_months: 120,
  closing_costs: 41_000,
  buyer_equity: 100_000,
  required_personal_cash_flow: 100_000,
  dscr_mode: 'tax_adjusted',
};

const referenceDebtService =
  amortizeMonthlyPayment(552_150, 0.115, 120) * 12;

describe('assumption helpers', () => {
  it('expands each assumption kind into its series', () => {
    expect(expandAssumption(scalar(5))).toEqual([5]);
    expect(expandAssumption(band(1, 2, 3))).toEqual([1, 2, 3]);
    expect(expandAssumption(sweep(0, 10, 5))).toEqual([0, 2.5, 5, 7.5, 10]);
  });

  it('collapses a sweep of one or zero steps to a single point at from', () => {
    expect(expandAssumption(sweep(5, 10, 1))).toEqual([5]);
    expect(expandAssumption(sweep(5, 10, 0))).toEqual([5]);
  });

  it('reports the representative base value of each kind', () => {
    expect(baseOf(scalar(5))).toBe(5);
    expect(baseOf(band(1, 2, 3))).toBe(2);
    expect(baseOf(sweep(0, 10, 5))).toBe(5);
  });
});

describe('computeDealPoint consistency with the point calculators', () => {
  it('equals the underlying point-calc composition at each assumption base', () => {
    const point = computeDealPoint(referenceInputs);
    const ncf = netCashFlow(163_000, referenceDebtService);

    expect(point.dscr).toBe(
      dscr(163_000, referenceDebtService, {
        mode: 'tax_adjusted',
        taxRate: 0.2564,
      }),
    );
    expect(point.net_cash_flow).toBe(ncf);
    expect(point.cash_on_cash).toBe(cashOnCash(ncf, 100_000));
    expect(point.deal_box_gap).toBe(dealBoxGap(ncf, 100_000));
    expect(point.purchase_multiple).toBe(
      purchaseMultiple(619_150, 41_000, 163_000),
    );
  });

  it('reduces a degenerate band to exactly the all-scalar point result', () => {
    const degenerate: DealAssumptions = {
      ...referenceInputs,
      sde: band(163_000, 163_000, 163_000),
      interest_rate: band(0.115, 0.115, 0.115),
    };
    expect(computeDealPoint(degenerate)).toEqual(
      computeDealPoint(referenceInputs),
    );
  });

  it('keeps the null-on-zero discipline of the point calculators', () => {
    expect(
      computeDealPoint({ ...referenceInputs, buyer_equity: 0 }).cash_on_cash,
    ).toBeNull();
    expect(
      computeDealPoint({ ...referenceInputs, sde: scalar(0) }).purchase_multiple,
    ).toBeNull();
    expect(
      computeDealPoint({ ...referenceInputs, loan_principal: 0 }).dscr,
    ).toBeNull();
  });
});

describe('computeDealPoint buyer-equity derivation', () => {
  const fundingSources: FundingSource[] = [
    { type: 'sba_7a', amount: 552_150, rate: 0.115, term_years: 10 },
    { type: 'cash_equity', amount: 108_000 },
  ];
  const derivedInputs: DealAssumptions = {
    ...referenceInputs,
    buyer_equity: undefined,
    funding_sources: fundingSources,
  };

  it('feeds the derived equity into cash-on-cash when no override is given', () => {
    const ncf = netCashFlow(163_000, referenceDebtService);
    expect(computeDealPoint(derivedInputs).cash_on_cash).toBe(
      cashOnCash(ncf, 108_000),
    );
  });

  it('prefers an explicit buyer_equity override over the derived value', () => {
    const ncf = netCashFlow(163_000, referenceDebtService);
    expect(
      computeDealPoint({ ...derivedInputs, buyer_equity: 100_000 })
        .cash_on_cash,
    ).toBe(cashOnCash(ncf, 100_000));
  });
});

describe('computeDealBand', () => {
  it('sweeps SDE and matches dscrSensitivity over the same -50%..+50% range', () => {
    const series = computeDealBand(
      referenceInputs,
      'sde',
      sweep(163_000 * 0.5, 163_000 * 1.5, 5),
    );
    const sensitivity = dscrSensitivity(163_000, referenceDebtService, {
      mode: 'tax_adjusted',
      taxRate: 0.2564,
    });

    expect(series.map((point) => point.driverValue)).toEqual(
      sensitivity.map((point) => point.sde),
    );
    expect(series.map((point) => point.outputs.dscr)).toEqual(
      sensitivity.map((point) => point.dscr),
    );
  });

  it('holds unrelated outputs constant while the swept driver moves', () => {
    const series = computeDealBand(
      referenceInputs,
      'sde',
      sweep(163_000 * 0.5, 163_000 * 1.5, 5),
    );
    const gaps = series.map((point) => point.outputs.deal_box_gap);
    expect(new Set(gaps).size).toBe(gaps.length);
  });
});

describe('computeScenarioBand', () => {
  const scenarioInputs: DealAssumptions = {
    ...referenceInputs,
    sde: band(140_000, 163_000, 180_000),
    annual_growth: band(0.05, 0.1, 0.15),
    interest_rate: band(0.1, 0.115, 0.13),
    dscr_tax_rate: band(0.2, 0.2564, 0.3),
    purchase_price: band(600_000, 619_150, 650_000),
  };

  it('composes low from the worst-case driver directions', () => {
    const scenario = computeScenarioBand(scenarioInputs);
    const worstDebt = amortizeMonthlyPayment(552_150, 0.13, 120) * 12;
    const worstNcf = netCashFlow(140_000, worstDebt);

    expect(scenario.low.net_cash_flow).toBe(worstNcf);
    expect(scenario.low.dscr).toBe(
      dscr(140_000, worstDebt, { mode: 'tax_adjusted', taxRate: 0.3 }),
    );
    expect(scenario.low.purchase_multiple).toBe(
      purchaseMultiple(650_000, 41_000, 140_000),
    );
  });

  it('composes high from the best-case driver directions', () => {
    const scenario = computeScenarioBand(scenarioInputs);
    const bestDebt = amortizeMonthlyPayment(552_150, 0.1, 120) * 12;
    const bestNcf = netCashFlow(180_000, bestDebt);

    expect(scenario.high.net_cash_flow).toBe(bestNcf);
    expect(scenario.high.dscr).toBe(
      dscr(180_000, bestDebt, { mode: 'tax_adjusted', taxRate: 0.2 }),
    );
    expect(scenario.high.purchase_multiple).toBe(
      purchaseMultiple(600_000, 41_000, 180_000),
    );
  });

  it('places the base scenario at the point result and between low and high', () => {
    const scenario = computeScenarioBand(scenarioInputs);
    expect(scenario.base).toEqual(computeDealPoint(scenarioInputs));
    expect(scenario.low.net_cash_flow).toBeLessThan(scenario.base.net_cash_flow);
    expect(scenario.high.net_cash_flow).toBeGreaterThan(
      scenario.base.net_cash_flow,
    );
  });
});

describe('computeDealProjection adapter over proForma', () => {
  it('expresses proForma through the engine at the assumption bases', () => {
    const projection = computeDealProjection(referenceInputs, 3);
    expect(projection).toEqual(
      proForma(163_000, 0.1, referenceDebtService, 3),
    );
  });

  it('starts year one at the point net cash flow', () => {
    const projection = computeDealProjection(referenceInputs, 3);
    expect(projection[0]).toBe(computeDealPoint(referenceInputs).net_cash_flow);
  });
});
