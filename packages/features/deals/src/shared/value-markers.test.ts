import { describe, expect, it } from 'vitest';

import {
  type ValueMarkerQuestion,
  computeRiskSummary,
  valueMarkerCatalog,
} from './value-markers';

// Rule under test, per category and overall:
//   - somewhat_risky wins if its count exceeds looks_good plus not_good combined
//   - otherwise the greater of looks_good vs not_good wins
//   - a looks_good/not_good tie (when somewhat_risky has not won) resolves to
//     somewhat_risky
//   - a category with no assessed ratings is unassessed
// overall applies the same rule across every assessed rating.

const fixtures: ValueMarkerQuestion[] = [
  { key: 'fv1', category: 'financial_viability', prompt: 'q' },
  { key: 'fv2', category: 'financial_viability', prompt: 'q' },
  { key: 'fv3', category: 'financial_viability', prompt: 'q' },
  { key: 'od1', category: 'owner_dependency', prompt: 'q' },
  { key: 'od2', category: 'owner_dependency', prompt: 'q' },
  { key: 'od3', category: 'owner_dependency', prompt: 'q' },
  { key: 'rr1', category: 'recurring_revenue', prompt: 'q' },
  { key: 'rr2', category: 'recurring_revenue', prompt: 'q' },
  { key: 'up1', category: 'upside_potential', prompt: 'q' },
];

describe('computeRiskSummary', () => {
  it('ranks a category somewhat_risky when it outnumbers the other two combined', () => {
    const summary = computeRiskSummary(
      { fv1: 'somewhat_risky', fv2: 'somewhat_risky', fv3: 'looks_good' },
      fixtures,
    );

    expect(summary.categories.financial_viability).toBe('somewhat_risky');
  });

  it('ranks a category by the greater of looks_good vs not_good when somewhat_risky has not won', () => {
    const summary = computeRiskSummary(
      { fv1: 'looks_good', fv2: 'looks_good', fv3: 'not_good' },
      fixtures,
    );

    expect(summary.categories.financial_viability).toBe('looks_good');
  });

  it('ranks a category not_good when not_good leads', () => {
    const summary = computeRiskSummary(
      { od1: 'not_good', od2: 'not_good', od3: 'looks_good' },
      fixtures,
    );

    expect(summary.categories.owner_dependency).toBe('not_good');
  });

  it('breaks a looks_good/not_good tie toward somewhat_risky', () => {
    const summary = computeRiskSummary(
      { rr1: 'looks_good', rr2: 'not_good' },
      fixtures,
    );

    expect(summary.categories.recurring_revenue).toBe('somewhat_risky');
  });

  it('marks a category with no assessed ratings as unassessed', () => {
    const summary = computeRiskSummary({ fv1: 'looks_good' }, fixtures);

    expect(summary.categories.upside_potential).toBe('unassessed');
  });

  it('computes the overall rank across every assessed rating', () => {
    const summary = computeRiskSummary(
      {
        fv1: 'looks_good',
        fv2: 'looks_good',
        od1: 'looks_good',
        od2: 'not_good',
        rr1: 'not_good',
      },
      fixtures,
    );

    expect(summary.overall).toBe('looks_good');
  });

  it('is unassessed overall when nothing has been rated', () => {
    const summary = computeRiskSummary({}, fixtures);

    expect(summary.overall).toBe('unassessed');
  });

  it('ships a catalog with several authored questions per category', () => {
    const categories = new Set(valueMarkerCatalog.map((q) => q.category));

    expect(categories.size).toBe(10);
    for (const category of categories) {
      const count = valueMarkerCatalog.filter(
        (q) => q.category === category,
      ).length;
      expect(count).toBeGreaterThanOrEqual(2);
    }
  });
});
