import { describe, expect, it } from 'vitest';

import {
  REFERENCE_GUARANTEE_FEE_SCHEDULE,
  computeGuaranteeFee,
} from './sba-fees';

describe('computeGuaranteeFee', () => {
  it('charges 3% of the 75% guaranteed portion', () => {
    expect(
      computeGuaranteeFee(1_000_000, REFERENCE_GUARANTEE_FEE_SCHEDULE),
    ).toBe(22_500);
  });

  it('reads the rate from the dated schedule version', () => {
    expect(REFERENCE_GUARANTEE_FEE_SCHEDULE.effective_date).toBe('2024-10-01');
  });
});
