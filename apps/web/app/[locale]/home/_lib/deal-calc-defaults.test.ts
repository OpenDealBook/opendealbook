import { describe, expect, it } from 'vitest';

import { STARTER_SCENARIO_PATHS } from '@odb/calculators';

import { parseDealCalcDefaults } from './deal-calc-defaults';

const savedPaths = {
  worst: { revenue_loss: 0.2, growth: -0.02, margin_change: -0.03, rate_shift: 0.03 },
  great: { revenue_loss: 0, growth: 0.08, margin_change: 0.01, rate_shift: -0.02 },
};

describe('parseDealCalcDefaults', () => {
  it('uses the ruled starters when the team saved none', () => {
    expect(parseDealCalcDefaults(null)).toEqual({
      afterStandby: 'full_term_after_standby',
      yearBasis: 'months_from_close',
      scenarioPaths: STARTER_SCENARIO_PATHS,
      minimumDscr: 1.25,
    });
  });

  it('reads the saved team defaults', () => {
    expect(
      parseDealCalcDefaults({
        after_standby: 'remaining_term',
        year_basis: 'fiscal_year',
        scenario_paths: savedPaths,
        minimum_dscr: 1.4,
      }),
    ).toEqual({
      afterStandby: 'remaining_term',
      yearBasis: 'fiscal_year',
      scenarioPaths: savedPaths,
      minimumDscr: 1.4,
    });
  });

  it('uses the starter paths when a saved team has no path defaults yet', () => {
    expect(
      parseDealCalcDefaults({
        after_standby: 'remaining_term',
        year_basis: 'fiscal_year',
        scenario_paths: null,
        minimum_dscr: 1.25,
      }).scenarioPaths,
    ).toEqual(STARTER_SCENARIO_PATHS);
  });

  it('refuses a stored value outside the known choices', () => {
    expect(() =>
      parseDealCalcDefaults({
        after_standby: 'interest_only',
        year_basis: 'fiscal_year',
        scenario_paths: null,
        minimum_dscr: 1.25,
      }),
    ).toThrow();
  });
});
