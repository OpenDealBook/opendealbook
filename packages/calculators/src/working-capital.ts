export interface WorkingCapitalInput {
  current_assets: number;
  current_liabilities: number;
  avg_monthly_revenue: number;
}

export interface WorkingCapitalResult {
  working_capital: number;
  months_of_revenue_covered: number | null;
}

export function workingCapital(
  input: WorkingCapitalInput,
): WorkingCapitalResult {
  const workingCapitalAmount = input.current_assets - input.current_liabilities;
  return {
    working_capital: workingCapitalAmount,
    months_of_revenue_covered:
      input.avg_monthly_revenue === 0
        ? null
        : workingCapitalAmount / input.avg_monthly_revenue,
  };
}
