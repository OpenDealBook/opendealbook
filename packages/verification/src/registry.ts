import { payrollTaxVsW2Check } from './checks/payroll-tax-vs-w2';
import { revenueVsDdFinancialsCheck } from './checks/revenue-vs-dd-financials';

export const reconciliationChecks = {
  payroll_tax_vs_w2: payrollTaxVsW2Check,
  revenue_vs_dd_financials: revenueVsDdFinancialsCheck,
} as const;

export type CheckKey = keyof typeof reconciliationChecks;
