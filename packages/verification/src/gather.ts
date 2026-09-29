import type { PayrollTaxVsW2Input } from './checks/payroll-tax-vs-w2';
import { payrollTaxVsW2Check } from './checks/payroll-tax-vs-w2';
import type { RevenueVsDdFinancialsInput } from './checks/revenue-vs-dd-financials';
import { revenueVsDdFinancialsCheck } from './checks/revenue-vs-dd-financials';
import type { ReconciliationCheck } from './contract';
import type { RunnableCheck } from './runner';

export interface StructuredCheckInputs {
  payroll_tax_vs_w2?: PayrollTaxVsW2Input;
  revenue_vs_dd_financials?: RevenueVsDdFinancialsInput;
}

export function structuredInputChecks(
  inputs: StructuredCheckInputs,
): RunnableCheck<unknown>[] {
  const runnable: RunnableCheck<unknown>[] = [];

  if (inputs.payroll_tax_vs_w2) {
    const input = inputs.payroll_tax_vs_w2;
    runnable.push({
      check: payrollTaxVsW2Check as ReconciliationCheck<unknown>,
      gather: async () => input,
    });
  }

  if (inputs.revenue_vs_dd_financials) {
    const input = inputs.revenue_vs_dd_financials;
    runnable.push({
      check: revenueVsDdFinancialsCheck as ReconciliationCheck<unknown>,
      gather: async () => input,
    });
  }

  return runnable;
}
