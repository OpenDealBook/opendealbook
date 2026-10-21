import { describe, expect, it } from 'vitest';

import {
  cashOnCash,
  dealBoxGap,
  purchaseMultiple,
  tenYearProForma,
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

const sba: FundingSource = {
  type: 'sba_7a',
  amount: 360_000,
  rate: 0.06,
  term_years: 10,
};

const referenceInputs: DealAssumptions = {
  sde: scalar(100_000),
  annual_growth: scalar(0),
  interest_rate_delta: scalar(0),
  dscr_tax_rate: scalar(0),
  purchase_price: scalar(500_000),
  funding_sources: [sba, { type: 'cash_equity', amount: 140_000 }],
  basis: { kind: 'months_from_close' },
  closing_costs: 0,
  required_personal_cash_flow: 40_000,
  dscr_mode: 'tax_adjusted',
};

const DEBT_AT_6 = 47_960.86;
const DEBT_AT_12 = 61_979.45;

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

describe('computeDealPoint on funding-source debt service', () => {
  it('uses the loans as entered for year 1', () => {
    const point = computeDealPoint(referenceInputs);

    expect(point.net_cash_flow).toBeCloseTo(100_000 - DEBT_AT_6, 2);
    expect(point.dscr).toBeCloseTo(100_000 / DEBT_AT_6, 6);
    expect(point.cash_on_cash).toBe(cashOnCash(point.net_cash_flow, 140_000));
    expect(point.deal_box_gap).toBe(dealBoxGap(point.net_cash_flow, 40_000));
    expect(point.purchase_multiple).toBe(purchaseMultiple(500_000, 0, 100_000));
  });

  it('follows standby: a note on an 18-month standby adds nothing in year 1', () => {
    const point = computeDealPoint({
      ...referenceInputs,
      funding_sources: [
        { type: 'seller_financing', amount: 120_000, rate: 0, term_years: 5, standby_months: 18 },
      ],
    });
    expect(point.net_cash_flow).toBe(100_000);
    expect(point.dscr).toBeNull();
  });

  it("follows the calc's fiscal year basis", () => {
    const point = computeDealPoint({
      ...referenceInputs,
      funding_sources: [{ ...sba, rate: 0 }],
      basis: {
        kind: 'fiscal_year',
        close_date: '2026-03-15',
        fiscal_year_end_month: 12,
      },
    });
    expect(point.net_cash_flow).toBe(100_000 - 27_000);
  });

  it('prefers an explicit buyer_equity override over the derived value', () => {
    const point = computeDealPoint({ ...referenceInputs, buyer_equity: 100_000 });
    expect(point.cash_on_cash).toBe(cashOnCash(point.net_cash_flow, 100_000));
  });
});

describe('computeDealBand over the interest rate delta', () => {
  it("shifts every loan's own rate by the delta and leaves rateless sources alone", () => {
    const series = computeDealBand(
      referenceInputs,
      'interest_rate_delta',
      sweep(-0.06, 0.06, 3),
    );

    expect(series.map((point) => point.driverValue)).toEqual([-0.06, 0, 0.06]);
    expect(series[0]!.outputs.net_cash_flow).toBeCloseTo(100_000 - 36_000, 6);
    expect(series[1]!.outputs.net_cash_flow).toBeCloseTo(100_000 - DEBT_AT_6, 2);
    expect(series[2]!.outputs.net_cash_flow).toBeCloseTo(100_000 - DEBT_AT_12, 2);
  });
});

describe('computeScenarioBand', () => {
  const scenarioInputs: DealAssumptions = {
    ...referenceInputs,
    sde: band(80_000, 100_000, 120_000),
    interest_rate_delta: band(-0.06, 0, 0.06),
    dscr_tax_rate: band(0, 0.1, 0.2),
    purchase_price: band(450_000, 500_000, 550_000),
  };

  it('composes low from the worst-case directions, raising every loan rate', () => {
    const low = computeScenarioBand(scenarioInputs).low;
    expect(low.net_cash_flow).toBeCloseTo(80_000 - DEBT_AT_12, 2);
    expect(low.purchase_multiple).toBe(purchaseMultiple(550_000, 0, 80_000));
  });

  it('composes high from the best-case directions, lowering every loan rate', () => {
    const high = computeScenarioBand(scenarioInputs).high;
    expect(high.net_cash_flow).toBeCloseTo(120_000 - 36_000, 6);
    expect(high.dscr).toBeCloseTo(120_000 / 36_000, 6);
  });

  it('places the base scenario at the loans as entered', () => {
    const scenario = computeScenarioBand(scenarioInputs);
    expect(scenario.base).toEqual(computeDealPoint(scenarioInputs));
    expect(scenario.base.net_cash_flow).toBeCloseTo(100_000 - DEBT_AT_6, 2);
  });
});

describe('computeDealProjection', () => {
  it("subtracts each year's own funding-source debt service for 10 years", () => {
    const projection = computeDealProjection({
      ...referenceInputs,
      funding_sources: [
        { type: 'seller_financing', amount: 120_000, rate: 0, term_years: 5, standby_months: 18 },
      ],
    });
    expect(projection).toEqual([
      100_000, 88_000, 76_000, 76_000, 76_000, 76_000, 88_000, 100_000,
      100_000, 100_000,
    ]);
  });

  it('matches the calculator pro forma at the assumption bases', () => {
    expect(computeDealProjection(referenceInputs)).toEqual(
      tenYearProForma({
        sde: 100_000,
        annualGrowth: 0,
        sources: referenceInputs.funding_sources,
        dscrOptions: { mode: 'tax_adjusted', taxRate: 0 },
        basis: { kind: 'months_from_close' },
      }),
    );
  });
});
