import { describe, expect, it } from 'vitest';

import { reconciliationChecks } from './registry';

describe('reconciliationChecks', () => {
  it('registers each check under its own key', () => {
    expect(Object.keys(reconciliationChecks).sort()).toEqual([
      'payroll_tax_vs_w2',
      'revenue_vs_dd_financials',
    ]);
    expect(reconciliationChecks.payroll_tax_vs_w2.key).toBe('payroll_tax_vs_w2');
    expect(reconciliationChecks.revenue_vs_dd_financials.key).toBe(
      'revenue_vs_dd_financials',
    );
  });
});
