import { describe, expect, it } from 'vitest';

import { dealBoxCriteriaSchema } from './criteria';

describe('dealBoxCriteriaSchema size filters', () => {
  it('leaves every size filter open when none is set', () => {
    expect(dealBoxCriteriaSchema.parse({}).size).toEqual({
      jobs: { min: null, max: null },
      pppLoanAmount: { min: null, max: null },
      form5500Participants: { min: null, max: null },
      minBusinessAgeYears: null,
    });
  });

  it('keeps the ranges and minimum age a team sets', () => {
    const size = {
      jobs: { min: 10, max: 50 },
      pppLoanAmount: { min: 100_000, max: null },
      form5500Participants: { min: null, max: 40 },
      minBusinessAgeYears: 10,
    };

    expect(dealBoxCriteriaSchema.parse({ size }).size).toEqual(size);
  });

  it('rejects a range whose minimum is above its maximum', () => {
    const result = dealBoxCriteriaSchema.safeParse({
      size: { jobs: { min: 50, max: 10 } },
    });

    expect(result.success).toBe(false);
  });
});
