export const VALUE_MARKER_RATINGS = [
  'looks_good',
  'somewhat_risky',
  'not_good',
] as const;

export const VALUE_MARKER_CATEGORIES = [
  'financial_viability',
  'diversification',
  'employee_risk',
  'cashflow_quality',
  'competitive_advantage',
  'customer_satisfaction',
  'recurring_revenue',
  'owner_dependency',
  'upside_potential',
  'process_maturity',
] as const;

export type ValueMarkerRating = (typeof VALUE_MARKER_RATINGS)[number];
export type ValueMarkerCategory = (typeof VALUE_MARKER_CATEGORIES)[number];
export type ValueMarkerRank = ValueMarkerRating | 'unassessed';

export interface ValueMarkerQuestion {
  key: string;
  category: ValueMarkerCategory;
  prompt: string;
}

export interface RiskSummary {
  categories: Record<string, ValueMarkerRank>;
  overall: ValueMarkerRank;
}

export const valueMarkerCatalog: ValueMarkerQuestion[] = [
  {
    key: 'financial_viability.profit_consistency',
    category: 'financial_viability',
    prompt: 'Have earnings held up consistently across the last three years?',
  },
  {
    key: 'financial_viability.margin_health',
    category: 'financial_viability',
    prompt: 'Are profit margins healthy for this industry and trending steady or up?',
  },
  {
    key: 'financial_viability.debt_load',
    category: 'financial_viability',
    prompt: 'Is existing debt modest enough that the business can carry acquisition financing?',
  },
  {
    key: 'diversification.customer_concentration',
    category: 'diversification',
    prompt: 'Is revenue spread across many customers rather than a few large accounts?',
  },
  {
    key: 'diversification.supplier_concentration',
    category: 'diversification',
    prompt: 'Can the business source from several suppliers without a single point of failure?',
  },
  {
    key: 'diversification.product_mix',
    category: 'diversification',
    prompt: 'Does revenue come from a mix of products or services rather than one offering?',
  },
  {
    key: 'employee_risk.key_staff_retention',
    category: 'employee_risk',
    prompt: 'Are the employees critical to operations likely to stay through the transition?',
  },
  {
    key: 'employee_risk.staffing_levels',
    category: 'employee_risk',
    prompt: 'Is the team adequately staffed without obvious gaps or heavy turnover?',
  },
  {
    key: 'employee_risk.management_depth',
    category: 'employee_risk',
    prompt: 'Is there a management layer that can run the business day to day?',
  },
  {
    key: 'cashflow_quality.collections',
    category: 'cashflow_quality',
    prompt: 'Does the business collect receivables promptly without large overdue balances?',
  },
  {
    key: 'cashflow_quality.seasonality',
    category: 'cashflow_quality',
    prompt: 'Is cash flow steady across the year rather than sharply seasonal?',
  },
  {
    key: 'cashflow_quality.working_capital',
    category: 'cashflow_quality',
    prompt: 'Does the business operate on reasonable working capital without constant cash strain?',
  },
  {
    key: 'competitive_advantage.moat',
    category: 'competitive_advantage',
    prompt: 'Does the business hold a durable edge that is hard for rivals to copy?',
  },
  {
    key: 'competitive_advantage.pricing_power',
    category: 'competitive_advantage',
    prompt: 'Can the business raise prices without losing meaningful volume?',
  },
  {
    key: 'competitive_advantage.market_position',
    category: 'competitive_advantage',
    prompt: 'Does the business hold a defensible position in its local or niche market?',
  },
  {
    key: 'customer_satisfaction.retention',
    category: 'customer_satisfaction',
    prompt: 'Do customers come back, with low churn and repeat business?',
  },
  {
    key: 'customer_satisfaction.reputation',
    category: 'customer_satisfaction',
    prompt: 'Is the public reputation and review sentiment strong and credible?',
  },
  {
    key: 'customer_satisfaction.referrals',
    category: 'customer_satisfaction',
    prompt: 'Does a meaningful share of new business arrive through referrals?',
  },
  {
    key: 'recurring_revenue.contract_share',
    category: 'recurring_revenue',
    prompt: 'Is a large share of revenue contracted or recurring rather than one-off?',
  },
  {
    key: 'recurring_revenue.renewal_rate',
    category: 'recurring_revenue',
    prompt: 'Do recurring agreements renew at a high and predictable rate?',
  },
  {
    key: 'recurring_revenue.backlog',
    category: 'recurring_revenue',
    prompt: 'Is there a visible backlog or pipeline that supports forward revenue?',
  },
  {
    key: 'owner_dependency.relationships',
    category: 'owner_dependency',
    prompt: 'Do customer and supplier relationships sit with the business rather than the owner personally?',
  },
  {
    key: 'owner_dependency.daily_operations',
    category: 'owner_dependency',
    prompt: 'Can the business run without the owner handling daily operations?',
  },
  {
    key: 'owner_dependency.transition_support',
    category: 'owner_dependency',
    prompt: 'Is the owner willing to support a transition long enough to transfer knowledge?',
  },
  {
    key: 'upside_potential.growth_runway',
    category: 'upside_potential',
    prompt: 'Is there a clear runway to grow revenue beyond current levels?',
  },
  {
    key: 'upside_potential.untapped_channels',
    category: 'upside_potential',
    prompt: 'Are there untapped channels, markets, or offerings a new owner could pursue?',
  },
  {
    key: 'upside_potential.operational_leverage',
    category: 'upside_potential',
    prompt: 'Could straightforward operational improvements lift margins or capacity?',
  },
  {
    key: 'process_maturity.documented_procedures',
    category: 'process_maturity',
    prompt: 'Are core procedures documented well enough for someone new to follow them?',
  },
  {
    key: 'process_maturity.bookkeeping',
    category: 'process_maturity',
    prompt: 'Are the books clean, current, and reconciled to source records?',
  },
  {
    key: 'process_maturity.systems',
    category: 'process_maturity',
    prompt: 'Do reliable systems support operations rather than ad hoc manual effort?',
  },
];

function rankCounts(ratings: ValueMarkerRating[]): ValueMarkerRank {
  if (ratings.length === 0) {
    return 'unassessed';
  }

  const looksGood = ratings.filter((r) => r === 'looks_good').length;
  const somewhatRisky = ratings.filter((r) => r === 'somewhat_risky').length;
  const notGood = ratings.filter((r) => r === 'not_good').length;

  if (somewhatRisky > looksGood + notGood) {
    return 'somewhat_risky';
  }

  if (looksGood > notGood) {
    return 'looks_good';
  }

  if (notGood > looksGood) {
    return 'not_good';
  }

  return 'somewhat_risky';
}

export function computeRiskSummary(
  ratings: Record<string, ValueMarkerRating>,
  catalog: ValueMarkerQuestion[] = valueMarkerCatalog,
): RiskSummary {
  const byCategory = new Map<string, ValueMarkerRating[]>();
  const all: ValueMarkerRating[] = [];

  for (const question of catalog) {
    const bucket = byCategory.get(question.category) ?? [];
    byCategory.set(question.category, bucket);

    const rating = ratings[question.key];
    if (rating) {
      bucket.push(rating);
      all.push(rating);
    }
  }

  const categories: Record<string, ValueMarkerRank> = {};
  for (const [category, buckets] of byCategory) {
    categories[category] = rankCounts(buckets);
  }

  return { categories, overall: rankCounts(all) };
}
