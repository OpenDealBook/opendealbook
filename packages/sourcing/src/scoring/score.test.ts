import { describe, expect, it } from 'vitest';

import { dealBoxCriteriaSchema } from './criteria';
import { scoreFirm, type ScorableFirm } from './score';

function firm(overrides: Partial<ScorableFirm>): ScorableFirm {
  return {
    industry: null,
    state: null,
    city: null,
    employee_band: null,
    owner_age_estimate: null,
    service_mix_json: {},
    ...overrides,
  };
}

describe('scoreFirm', () => {
  it('returns 0 when the firm hits an exclusion', () => {
    const criteria = dealBoxCriteriaSchema.parse({
      weights: { industry: 1 },
      industries: ['HVAC'],
      exclusions: { states: ['CA'] },
    });

    expect(scoreFirm(firm({ industry: 'HVAC', state: 'CA' }), criteria)).toBe(
      0,
    );
  });

  it('returns 0 when no weights are configured', () => {
    const criteria = dealBoxCriteriaSchema.parse({ industries: ['HVAC'] });

    expect(scoreFirm(firm({ industry: 'HVAC' }), criteria)).toBe(0);
  });

  it('returns 100 when the only weighted dimension matches', () => {
    const criteria = dealBoxCriteriaSchema.parse({
      weights: { geography: 2 },
      states: ['TX'],
    });

    expect(scoreFirm(firm({ state: 'tx' }), criteria)).toBe(100);
  });

  it('blends dimensions by weight', () => {
    const criteria = dealBoxCriteriaSchema.parse({
      weights: { industry: 3, geography: 1 },
      industries: ['Plumbing'],
      states: ['TX'],
    });

    expect(
      scoreFirm(firm({ industry: 'Plumbing', state: 'FL' }), criteria),
    ).toBe(75);
  });

  it('scores service mix by overlap fraction', () => {
    const criteria = dealBoxCriteriaSchema.parse({
      weights: { serviceMix: 1 },
      serviceMix: ['install', 'repair', 'maintenance', 'inspection'],
    });

    const scored = scoreFirm(
      firm({ service_mix_json: { install: 0.5, repair: 0.5 } }),
      criteria,
    );

    expect(scored).toBe(50);
  });

  it('treats owner age at or above the retirement threshold as a match', () => {
    const criteria = dealBoxCriteriaSchema.parse({
      weights: { ownerAge: 1 },
      ownerRetirementAge: 60,
    });

    expect(scoreFirm(firm({ owner_age_estimate: 63 }), criteria)).toBe(100);
    expect(scoreFirm(firm({ owner_age_estimate: 41 }), criteria)).toBe(0);
  });
});
