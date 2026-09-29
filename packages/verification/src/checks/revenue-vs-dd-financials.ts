import type { ReconciliationCheck, ReconciliationLinks } from '../contract';
import { reconcile } from '../reconcile';

export interface RevenueVsDdFinancialsInput {
  period: string;
  marketingRevenue: number | null;
  ddFinancialsRevenue: number | null;
  links?: ReconciliationLinks;
}

export const revenueVsDdFinancialsCheck: ReconciliationCheck<RevenueVsDdFinancialsInput> =
  {
    key: 'revenue_vs_dd_financials',
    evaluate(input) {
      return reconcile({
        checkKey: 'revenue_vs_dd_financials',
        period: input.period,
        actual: input.marketingRevenue,
        expected: input.ddFinancialsRevenue,
        bands: { info: 0.01, warning: 0.05 },
        links: input.links ?? {},
      });
    },
  };
