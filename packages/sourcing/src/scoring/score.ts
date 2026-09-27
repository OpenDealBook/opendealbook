import type { DealBoxCriteria } from './criteria';

export interface ScorableFirm {
  industry: string | null;
  state: string | null;
  city: string | null;
  employee_band: string | null;
  owner_age_estimate: number | null;
  service_mix_json: unknown;
}

function lowerSet(values: string[]): Set<string> {
  return new Set(values.map((value) => value.toLowerCase()));
}

function has(set: Set<string>, value: string | null): boolean {
  return value !== null && set.has(value.toLowerCase());
}

function isExcluded(firm: ScorableFirm, criteria: DealBoxCriteria): boolean {
  return (
    has(lowerSet(criteria.exclusions.industries), firm.industry) ||
    has(lowerSet(criteria.exclusions.naics), firm.industry) ||
    has(lowerSet(criteria.exclusions.states), firm.state)
  );
}

function industryMatch(firm: ScorableFirm, criteria: DealBoxCriteria): number {
  const industries = lowerSet(criteria.industries);
  const naics = lowerSet(criteria.naics);

  return has(industries, firm.industry) || has(naics, firm.industry) ? 1 : 0;
}

function revenueMatch(firm: ScorableFirm, criteria: DealBoxCriteria): number {
  return has(lowerSet(criteria.employeeBands), firm.employee_band) ? 1 : 0;
}

function geographyMatch(firm: ScorableFirm, criteria: DealBoxCriteria): number {
  const states = lowerSet(criteria.states);
  const cities = lowerSet(criteria.cities);

  return has(states, firm.state) || has(cities, firm.city) ? 1 : 0;
}

function ownerAgeMatch(firm: ScorableFirm, criteria: DealBoxCriteria): number {
  if (
    criteria.ownerRetirementAge === null ||
    firm.owner_age_estimate === null
  ) {
    return 0;
  }

  return firm.owner_age_estimate >= criteria.ownerRetirementAge ? 1 : 0;
}

function serviceMixMatch(
  firm: ScorableFirm,
  criteria: DealBoxCriteria,
): number {
  if (criteria.serviceMix.length === 0) {
    return 0;
  }

  const mix = firm.service_mix_json;

  if (typeof mix !== 'object' || mix === null) {
    return 0;
  }

  const offered = lowerSet(Object.keys(mix as Record<string, unknown>));
  const matched = criteria.serviceMix.filter((service) =>
    offered.has(service.toLowerCase()),
  ).length;

  return matched / criteria.serviceMix.length;
}

export function scoreFirm(
  firm: ScorableFirm,
  criteria: DealBoxCriteria,
): number {
  if (isExcluded(firm, criteria)) {
    return 0;
  }

  const { weights } = criteria;
  const dimensions: [number, number][] = [
    [weights.industry, industryMatch(firm, criteria)],
    [weights.revenue, revenueMatch(firm, criteria)],
    [weights.geography, geographyMatch(firm, criteria)],
    [weights.ownerAge, ownerAgeMatch(firm, criteria)],
    [weights.serviceMix, serviceMixMatch(firm, criteria)],
  ];

  const totalWeight = dimensions.reduce((sum, [weight]) => sum + weight, 0);

  if (totalWeight === 0) {
    return 0;
  }

  const weighted = dimensions.reduce(
    (sum, [weight, match]) => sum + weight * match,
    0,
  );

  return Math.round((weighted / totalWeight) * 100);
}
