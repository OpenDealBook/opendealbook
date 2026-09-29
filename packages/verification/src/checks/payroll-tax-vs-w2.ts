import type { ReconciliationCheck, ReconciliationLinks } from '../contract';
import { reconcile } from '../reconcile';

export interface PayrollTaxVsW2Input {
  period: string;
  w2WagesTotal: number | null;
  payrollTaxWagesTotal: number | null;
  links?: ReconciliationLinks;
}

export const payrollTaxVsW2Check: ReconciliationCheck<PayrollTaxVsW2Input> = {
  key: 'payroll_tax_vs_w2',
  evaluate(input) {
    return reconcile({
      checkKey: 'payroll_tax_vs_w2',
      period: input.period,
      actual: input.w2WagesTotal,
      expected: input.payrollTaxWagesTotal,
      bands: { info: 0.005, warning: 0.02 },
      links: input.links ?? {},
    });
  },
};
