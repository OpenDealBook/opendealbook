import { describe, expect, it } from 'vitest';

import { workingCapital } from './working-capital';

describe('workingCapital', () => {
  it('computes working capital and months of revenue covered', () => {
    const result = workingCapital({
      current_assets: 300_000,
      current_liabilities: 120_000,
      avg_monthly_revenue: 90_000,
    });

    expect(result.working_capital).toBe(180_000);
    expect(result.months_of_revenue_covered).toBeCloseTo(2, 6);
  });

  it('returns null months when average monthly revenue is zero', () => {
    const result = workingCapital({
      current_assets: 300_000,
      current_liabilities: 120_000,
      avg_monthly_revenue: 0,
    });

    expect(result.working_capital).toBe(180_000);
    expect(result.months_of_revenue_covered).toBeNull();
  });
});
