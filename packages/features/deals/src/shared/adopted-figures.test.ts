import { describe, expect, it } from 'vitest';

import {
  adoptedFiguresOf,
  figuresToAdopt,
  multipleText,
  primaryCalcChanged,
} from './adopted-figures';

const adoption = adoptedFiguresOf({
  adopted_revenue: 3_400_000,
  adopted_sde: 870_000,
  adopted_ebitda: 610_000,
  adopted_years: [
    { year: 1, debt_service: 270_000, dscr: 3.23, net_cash_flow: 600_000 },
  ],
});

function primaryComputing(overrides: { sde?: number; dscr?: number }) {
  return {
    type: 'deal',
    adopt: {
      revenue: 3_400_000,
      sde: overrides.sde ?? 870_000,
      ebitda: 610_000,
      years: [
        {
          year: 1,
          debt_service: 270_000,
          dscr: overrides.dscr ?? 3.23,
          net_cash_flow: 600_000,
        },
      ],
    },
  };
}

describe('primaryCalcChanged', () => {
  it('is false when the primary calc computes what was adopted', () => {
    expect(primaryCalcChanged(adoption, primaryComputing({}))).toBe(false);
  });

  it('is true when the primary calc now computes a DSCR that shows differently', () => {
    expect(primaryCalcChanged(adoption, primaryComputing({ dscr: 3.22 }))).toBe(
      true,
    );
  });

  it('is true when the primary calc now computes a different SDE', () => {
    expect(
      primaryCalcChanged(adoption, primaryComputing({ sde: 780_000 })),
    ).toBe(true);
  });

  it('ignores differences finer than the figures are shown', () => {
    expect(
      primaryCalcChanged(
        adoption,
        primaryComputing({ sde: 870_000.3, dscr: 3.2349 }),
      ),
    ).toBe(false);
  });

  it('is false when the primary calc has no saved outputs', () => {
    expect(primaryCalcChanged(adoption, {})).toBe(false);
  });
});

describe('multipleText', () => {
  it('shows a multiple to 2 decimals', () => {
    expect(multipleText(3.2857)).toBe('3.29x');
    expect(multipleText(3.2)).toBe('3.20x');
  });
});

describe('figuresToAdopt', () => {
  it('refuses a calc snapshot that has nothing to adopt', () => {
    expect(() =>
      figuresToAdopt({ type: 'working_capital', working_capital: 120_000 }),
    ).toThrow();
  });

  it('refuses a figure that is not a number', () => {
    expect(() =>
      figuresToAdopt({
        adopt: { revenue: null, sde: '870000', ebitda: 610_000 },
      }),
    ).toThrow();
  });
});
