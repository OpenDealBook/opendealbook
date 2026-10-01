import { describe, expect, it } from 'vitest';

import {
  annualizeSde,
  recastPeriod,
  sdePeriodSchema,
  sdePeriodsSchema,
  weightedSde,
  type MinorAddbacks,
  type PrimaryAddbacks,
  type SdePeriod,
} from './sde';

function primary(overrides: Partial<PrimaryAddbacks> = {}): PrimaryAddbacks {
  return {
    depreciation_amortization: 0,
    interest: 0,
    taxes: 0,
    owner_salary: 0,
    owner_payroll_taxes: 0,
    ...overrides,
  };
}

function minor(overrides: Partial<MinorAddbacks> = {}): MinorAddbacks {
  return {
    non_working_family_salaries: 0,
    other_owner_salary_adjustments: 0,
    other_owner_payroll_taxes: 0,
    owner_auto_insurance_repairs: 0,
    donations: 0,
    fmv_rent_adjustment: 0,
    owner_insurance_premiums: 0,
    non_business_professional_services: 0,
    travel: 0,
    telephone: 0,
    maintenance_capex: 0,
    one_time_charges_or_income: 0,
    custom: [],
    ...overrides,
  };
}

function period(overrides: Partial<SdePeriod> = {}): SdePeriod {
  return {
    weight: 1,
    months: null,
    sales: 0,
    cogs: 0,
    opex: 0,
    primary: primary(),
    minor: minor(),
    ...overrides,
  };
}

describe('recastPeriod', () => {
  it('derives net income, basic discretionary earnings, and total SDE from the rows', () => {
    const recast = recastPeriod(
      period({
        sales: 1_000_000,
        cogs: 400_000,
        opex: 300_000,
        primary: primary({
          depreciation_amortization: 20_000,
          interest: 10_000,
          taxes: 15_000,
          owner_salary: 120_000,
          owner_payroll_taxes: 9_000,
        }),
        minor: minor({
          maintenance_capex: 5_000,
          donations: 2_000,
          custom: [{ label: 'legal one-off', amount: 3_000 }],
        }),
      }),
    );

    expect(recast.net_income).toBe(300_000);
    expect(recast.basic_discretionary_earnings).toBe(474_000);
    expect(recast.total_sde).toBe(484_000);
    expect(recast.margin).toBeCloseTo(0.484, 6);
  });

  it('returns a null margin when sales are zero', () => {
    expect(recastPeriod(period({ sales: 0 })).margin).toBeNull();
  });
});

describe('annualizeSde', () => {
  it('annualizes a partial year to whole dollars', () => {
    expect(annualizeSde(169_591, 3)).toBe(678_364);
  });

  it('leaves a full year unchanged for both null and twelve months', () => {
    expect(annualizeSde(561_646, null)).toBe(561_646);
    expect(annualizeSde(561_646, 12)).toBe(561_646);
  });

  it('treats zero or negative months as a full year rather than returning Infinity', () => {
    expect(annualizeSde(678_364, 0)).toBe(678_364);
    expect(annualizeSde(678_364, -3)).toBe(678_364);
  });
});

describe('sdePeriodSchema months validation', () => {
  it('accepts a partial-year month count in 1-11 and a null full year', () => {
    expect(sdePeriodSchema.parse(period({ months: 3 })).months).toBe(3);
    expect(sdePeriodSchema.parse(period({ months: null })).months).toBeNull();
  });

  it('rejects zero, twelve, out-of-range, and fractional months', () => {
    expect(() => sdePeriodSchema.parse(period({ months: 0 }))).toThrow();
    expect(() => sdePeriodSchema.parse(period({ months: 12 }))).toThrow();
    expect(() => sdePeriodSchema.parse(period({ months: 13 }))).toThrow();
    expect(() => sdePeriodSchema.parse(period({ months: 3.5 }))).toThrow();
  });
});

describe('sdePeriodsSchema weight-sum validation', () => {
  const periods = [
    period({ weight: 0.2, sales: 0 }),
    period({ weight: 0.3, sales: 561_646 }),
    period({ weight: 0.5, months: 3, sales: 169_591 }),
  ];

  it('accepts weights that sum to one and keeps the raw weighted sum', () => {
    expect(weightedSde(sdePeriodsSchema.parse(periods))).toBe(507_676);
  });

  it('rejects weights that do not sum to one', () => {
    const offWeights = [
      period({ weight: 0.2, sales: 0 }),
      period({ weight: 0.3, sales: 561_646 }),
      period({ weight: 0.4, months: 3, sales: 169_591 }),
    ];
    expect(() => sdePeriodsSchema.parse(offWeights)).toThrow();
  });
});

describe('weightedSde', () => {
  it('weights annualized period SDE and rounds to whole dollars', () => {
    const periods = [
      period({ weight: 0.2, sales: 0 }),
      period({ weight: 0.3, sales: 561_646 }),
      period({ weight: 0.5, months: 3, sales: 169_591 }),
    ];

    expect(weightedSde(periods)).toBe(507_676);
  });
});
