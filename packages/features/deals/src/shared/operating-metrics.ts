export interface OperatingPeriodMetrics {
  period_month: string;
  revenue: number | null;
  cogs: number | null;
  opex: number | null;
}

export interface OperatingBaseline {
  adopted_revenue: number | null;
  adopted_sde: number | null;
  adopted_ebitda: number | null;
}

export interface DerivedOperatingPeriod extends OperatingPeriodMetrics {
  net_operating_income: number | null;
  operating_margin: number | null;
}

export interface OperatingVariance {
  baseline: number | null;
  actual: number | null;
  absolute_delta: number | null;
  percent_delta: number | null;
}

export interface OperatingSummary {
  periods: DerivedOperatingPeriod[];
  latest: DerivedOperatingPeriod | null;
  trailing_annualized_revenue: number | null;
  trailing_annualized_net_operating_income: number | null;
  variance: {
    revenue: OperatingVariance;
    net_operating_income: OperatingVariance;
  };
}

function netOperatingIncome(
  period: OperatingPeriodMetrics,
): number | null {
  if (period.revenue === null || period.cogs === null || period.opex === null) {
    return null;
  }

  return period.revenue - period.cogs - period.opex;
}

function operatingMargin(
  revenue: number | null,
  noi: number | null,
): number | null {
  if (revenue === null || revenue === 0 || noi === null) {
    return null;
  }

  return noi / revenue;
}

function annualize(values: (number | null)[]): number | null {
  const available = values.filter((v): v is number => v !== null);

  if (available.length === 0) {
    return null;
  }

  const sum = available.reduce((total, v) => total + v, 0);
  return (sum / available.length) * 12;
}

function variance(actual: number | null, baseline: number | null): OperatingVariance {
  if (actual === null || baseline === null) {
    return { baseline, actual, absolute_delta: null, percent_delta: null };
  }

  const absolute_delta = actual - baseline;
  const percent_delta = baseline === 0 ? null : absolute_delta / baseline;

  return { baseline, actual, absolute_delta, percent_delta };
}

export function computeOperatingSummary(
  periods: OperatingPeriodMetrics[],
  baseline: OperatingBaseline,
): OperatingSummary {
  const derived: DerivedOperatingPeriod[] = periods.map((period) => {
    const noi = netOperatingIncome(period);

    return {
      ...period,
      net_operating_income: noi,
      operating_margin: operatingMargin(period.revenue, noi),
    };
  });

  const byMonthDesc = [...derived].sort((a, b) =>
    b.period_month.localeCompare(a.period_month),
  );

  const latest = byMonthDesc[0] ?? null;
  const window = byMonthDesc.slice(0, 12);

  const trailing_annualized_revenue = annualize(window.map((p) => p.revenue));
  const trailing_annualized_net_operating_income = annualize(
    window.map((p) => p.net_operating_income),
  );

  return {
    periods: derived,
    latest,
    trailing_annualized_revenue,
    trailing_annualized_net_operating_income,
    variance: {
      revenue: variance(trailing_annualized_revenue, baseline.adopted_revenue),
      net_operating_income: variance(
        trailing_annualized_net_operating_income,
        baseline.adopted_sde,
      ),
    },
  };
}
