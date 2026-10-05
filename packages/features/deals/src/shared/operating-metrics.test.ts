import { describe, expect, it } from 'vitest';

import {
  type OperatingBaseline,
  type OperatingPeriodMetrics,
  computeOperatingSummary,
} from './operating-metrics';

// Rules under test:
//   - net_operating_income = revenue - cogs - opex, null if any of the three
//     is null; operating_margin = net_operating_income / revenue, null if
//     net_operating_income is null, revenue is null, or revenue is 0.
//   - latest is the period with the greatest period_month, null when there
//     are no periods.
//   - the trailing window is the most recent min(12, periods.length)
//     periods by period_month. Within that window, trailing annualized
//     revenue sums the periods that have a non-null revenue, divides by how
//     many of those there are, then multiplies by 12; it is null when none
//     of the window periods have a revenue. Annualized net_operating_income
//     applies the same rule to each period's derived net_operating_income.
//   - variance compares the annualized actual to its baseline: null when
//     either side is null, percent_delta null when the baseline is 0.

const baseline: OperatingBaseline = {
  adopted_revenue: 1_200_000,
  adopted_sde: 240_000,
  adopted_ebitda: 200_000,
};

function period(
  month: string,
  overrides: Partial<OperatingPeriodMetrics> = {},
): OperatingPeriodMetrics {
  return {
    period_month: month,
    revenue: 100_000,
    cogs: 40_000,
    opex: 20_000,
    ...overrides,
  };
}

describe('computeOperatingSummary', () => {
  it('derives net_operating_income and operating_margin per period', () => {
    const summary = computeOperatingSummary(
      [period('2026-01-01', { revenue: 100_000, cogs: 40_000, opex: 20_000 })],
      baseline,
    );

    expect(summary.periods[0]?.net_operating_income).toBe(40_000);
    expect(summary.periods[0]?.operating_margin).toBe(0.4);
  });

  it('derives a null net_operating_income when any input is null', () => {
    const summary = computeOperatingSummary(
      [period('2026-01-01', { cogs: null })],
      baseline,
    );

    expect(summary.periods[0]?.net_operating_income).toBeNull();
    expect(summary.periods[0]?.operating_margin).toBeNull();
  });

  it('derives a null operating_margin when revenue is null or zero', () => {
    const zeroRevenue = computeOperatingSummary(
      [period('2026-01-01', { revenue: 0, cogs: 0, opex: 0 })],
      baseline,
    );
    const nullRevenue = computeOperatingSummary(
      [period('2026-01-01', { revenue: null })],
      baseline,
    );

    expect(zeroRevenue.periods[0]?.net_operating_income).toBe(0);
    expect(zeroRevenue.periods[0]?.operating_margin).toBeNull();
    expect(nullRevenue.periods[0]?.operating_margin).toBeNull();
  });

  it('picks the period with the greatest period_month as latest', () => {
    const summary = computeOperatingSummary(
      [period('2026-01-01'), period('2026-03-01'), period('2026-02-01')],
      baseline,
    );

    expect(summary.latest?.period_month).toBe('2026-03-01');
  });

  it('is null latest when there are no periods', () => {
    const summary = computeOperatingSummary([], baseline);

    expect(summary.latest).toBeNull();
  });

  it('annualizes trailing revenue by averaging the available months in the window and scaling to 12', () => {
    const summary = computeOperatingSummary(
      [
        period('2026-01-01', { revenue: 90_000 }),
        period('2026-02-01', { revenue: 110_000 }),
      ],
      baseline,
    );

    // average of the 2 available months (100,000) scaled to 12 months.
    expect(summary.trailing_annualized_revenue).toBe(1_200_000);
  });

  it('only annualizes over the most recent 12 periods when more exist', () => {
    const periods = Array.from({ length: 13 }, (_, i) =>
      period(`2025-${String(i + 1).padStart(2, '0')}-01`, {
        revenue: i === 0 ? 1_000_000 : 100_000,
      }),
    );
    // periods[0] is month 2025-01 (the oldest, 13th-most-recent), excluded
    // from the trailing-12 window.

    const summary = computeOperatingSummary(periods, baseline);

    expect(summary.trailing_annualized_revenue).toBe(1_200_000);
  });

  it('skips null-revenue months when averaging but still scales to 12', () => {
    const summary = computeOperatingSummary(
      [
        period('2026-01-01', { revenue: null }),
        period('2026-02-01', { revenue: 200_000 }),
      ],
      baseline,
    );

    // one available month at 200,000, scaled to 12.
    expect(summary.trailing_annualized_revenue).toBe(2_400_000);
  });

  it('is a null trailing annualized revenue when no window period has revenue', () => {
    const summary = computeOperatingSummary(
      [period('2026-01-01', { revenue: null })],
      baseline,
    );

    expect(summary.trailing_annualized_revenue).toBeNull();
  });

  it('annualizes trailing net_operating_income the same way, skipping periods with a null derived value', () => {
    const summary = computeOperatingSummary(
      [
        period('2026-01-01', { revenue: 100_000, cogs: null, opex: 20_000 }),
        period('2026-02-01', { revenue: 100_000, cogs: 40_000, opex: 20_000 }),
      ],
      baseline,
    );

    // one available month at a NOI of 40,000, scaled to 12.
    expect(summary.trailing_annualized_net_operating_income).toBe(480_000);
  });

  it('computes an absolute and percentage variance of annualized revenue vs adopted_revenue', () => {
    const summary = computeOperatingSummary(
      [period('2026-01-01', { revenue: 110_000 })],
      baseline,
    );

    // annualized revenue = 110,000 * 12 = 1,320,000 vs adopted_revenue 1,200,000.
    expect(summary.variance.revenue.absolute_delta).toBe(120_000);
    expect(summary.variance.revenue.percent_delta).toBeCloseTo(0.1);
  });

  it('computes an absolute and percentage variance of annualized net_operating_income vs adopted_sde', () => {
    const summary = computeOperatingSummary(
      [period('2026-01-01', { revenue: 100_000, cogs: 40_000, opex: 40_000 })],
      baseline,
    );

    // NOI = 20,000/mo, annualized = 240,000, exactly matching adopted_sde.
    expect(summary.variance.net_operating_income.absolute_delta).toBe(0);
    expect(summary.variance.net_operating_income.percent_delta).toBe(0);
  });

  it('is a null variance when the baseline figure is null', () => {
    const summary = computeOperatingSummary(
      [period('2026-01-01')],
      { adopted_revenue: null, adopted_sde: null, adopted_ebitda: null },
    );

    expect(summary.variance.revenue.absolute_delta).toBeNull();
    expect(summary.variance.revenue.percent_delta).toBeNull();
    expect(summary.variance.net_operating_income.absolute_delta).toBeNull();
  });

  it('is a null variance when the annualized actual is null', () => {
    const summary = computeOperatingSummary(
      [period('2026-01-01', { revenue: null })],
      baseline,
    );

    expect(summary.variance.revenue.absolute_delta).toBeNull();
    expect(summary.variance.revenue.percent_delta).toBeNull();
  });

  it('is a null percent_delta when the baseline figure is zero, but still computes an absolute delta', () => {
    const summary = computeOperatingSummary(
      [period('2026-01-01', { revenue: 50_000 })],
      { adopted_revenue: 0, adopted_sde: null, adopted_ebitda: null },
    );

    expect(summary.variance.revenue.absolute_delta).toBe(600_000);
    expect(summary.variance.revenue.percent_delta).toBeNull();
  });
});
