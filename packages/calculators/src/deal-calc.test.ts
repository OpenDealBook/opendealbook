import { describe, expect, it } from 'vitest';

import {
  amortizeMonthlyPayment,
  dealBoxGap,
  deriveBuyerEquity,
  dscr,
  dscrSensitivity,
  ebitda,
  netCashFlow,
  netIncome,
  paybackYears,
  purchaseMultiple,
  revenueDropBeforeUnderwater,
  sdeFromPl,
  scenarioPathDriversSchema,
  tenYearProForma,
  threeYearProjection,
  type ProfitAndLoss,
  type YearBasis,
  yearBasisSchema,
} from './deal-calc';
import type { FundingSource } from './funding-source';

const round2 = (value: number) => Number(value.toFixed(2));
const MONTHS_FROM_CLOSE: YearBasis = { kind: 'months_from_close' };

describe('SDE from the P&L', () => {
  it('sums the primary addbacks onto net income', () => {
    const pl: ProfitAndLoss = {
      sales: 1_000_000,
      cogs: 500_000,
      opex: 300_000,
      depreciation_amortization: 20_000,
      taxes: 15_000,
      interest: 10_000,
      owner_benefits: 118_000,
    };

    expect(netIncome(pl)).toBe(200_000);
    expect(sdeFromPl(pl)).toBe(363_000);
  });
});

describe('EBITDA from the P&L', () => {
  const pl: ProfitAndLoss = {
    sales: 1_000_000,
    cogs: 500_000,
    opex: 300_000,
    depreciation_amortization: 20_000,
    taxes: 15_000,
    interest: 10_000,
    owner_benefits: 118_000,
  };

  it('adds depreciation, interest, and taxes back onto net income', () => {
    expect(ebitda(pl)).toBe(245_000);
  });

  it('excludes owner compensation, so it trails SDE by the owner addback', () => {
    expect(sdeFromPl(pl) - ebitda(pl)).toBe(pl.owner_benefits);
  });
});

describe('amortizeMonthlyPayment', () => {
  it('reproduces the SBA reference payment at 11.5% APR over 120 months', () => {
    expect(amortizeMonthlyPayment(552_150, 0.115, 120)).toBeCloseTo(7763, 0);
  });
});

describe('reference deal (DSCR 1.43x)', () => {
  const SDE = 163_000;
  const DEBT_SERVICE = 103_279;

  it('computes a tax-adjusted DSCR that rounds to 1.43 at a 25.64% tax rate', () => {
    const value = dscr(SDE, DEBT_SERVICE, {
      mode: 'tax_adjusted',
      taxRate: 0.2564,
    });
    expect(round2(value!)).toBe(1.43);
  });

  it('supports the SBA-standard DSCR variant', () => {
    const value = dscr(SDE, DEBT_SERVICE, {
      mode: 'sba_standard',
      ownerSalary: 20_000,
    });
    expect(round2(value!)).toBe(1.38);
  });

  it('computes net cash flow as SDE minus debt service', () => {
    expect(netCashFlow(SDE, DEBT_SERVICE)).toBe(59_721);
  });

  it('computes the purchase multiple over price plus closing costs', () => {
    expect(round2(purchaseMultiple(619_150, 41_000, SDE)!)).toBe(4.05);
  });

  it('computes the deal box gap against required personal cash flow', () => {
    expect(dealBoxGap(59_721, 100_000)).toBe(-40_279);
  });
});

describe('paybackYears', () => {
  it('ceils buyer equity over positive year-one net cash flow', () => {
    expect(paybackYears(100_000, 40_000)).toBe(3);
  });

  it('returns null when year-one net cash flow is zero or negative', () => {
    expect(paybackYears(100_000, 0)).toBeNull();
    expect(paybackYears(100_000, -40_279)).toBeNull();
  });
});

describe('revenueDropBeforeUnderwater', () => {
  it('expresses positive net cash flow as a fraction of sales', () => {
    expect(revenueDropBeforeUnderwater(59_721, 1_000_000)).toBeCloseTo(
      0.059721,
      6,
    );
  });

  it('returns null when already underwater (net cash flow zero or negative)', () => {
    expect(revenueDropBeforeUnderwater(0, 1_000_000)).toBeNull();
    expect(revenueDropBeforeUnderwater(-40_279, 1_000_000)).toBeNull();
  });
});

describe('threeYearProjection debt service', () => {
  const debtService = (sources: FundingSource[]) =>
    threeYearProjection({
      sde: 0,
      annualGrowth: 0,
      sources,
      dscrOptions: {},
      basis: MONTHS_FROM_CLOSE,
    }).map((year) => year.debt_service);
  const bySource = (sources: FundingSource[]) =>
    threeYearProjection({
      sde: 0,
      annualGrowth: 0,
      sources,
      dscrOptions: {},
      basis: MONTHS_FROM_CLOSE,
    }).map(
      (year) => year.debt_service_by_source,
    );
  const note = (standby_months?: number): FundingSource => ({
    type: 'seller_financing',
    amount: 200_000,
    rate: 0.08,
    term_years: 5,
    standby_months,
  });

  it('keeps year one unchanged for a seller note with a 6-month standby', () => {
    expect(debtService([note(6)])[0]).toBeCloseTo(25_321.31, 2);
  });

  it('charges twelve payments in each of years 1 to 3 without standby', () => {
    const loan: FundingSource = {
      type: 'sba_7a',
      amount: 360_000,
      rate: 0,
      term_years: 10,
    };
    expect(debtService([loan])).toEqual([36_000, 36_000, 36_000]);
  });

  it('stops payments at term end, leaving only the months still owed', () => {
    const loan: FundingSource = {
      type: 'conventional',
      amount: 30_000,
      rate: 0,
      term_years: 2.5,
    };
    expect(debtService([loan])).toEqual([12_000, 12_000, 6_000]);
  });

  it('shows zero once the loan is paid off', () => {
    const loan: FundingSource = {
      type: 'conventional',
      amount: 36_000,
      rate: 0,
      term_years: 2,
    };
    expect(debtService([loan])).toEqual([18_000, 18_000, 0]);
  });

  it('starts payments mid year 2 when an 18-month standby runs the full term after it', () => {
    const loan: FundingSource = {
      type: 'seller_financing',
      amount: 120_000,
      rate: 0,
      term_years: 5,
      standby_months: 18,
      after_standby: 'full_term_after_standby',
    };
    expect(debtService([loan])).toEqual([0, 12_000, 24_000]);
  });

  it('treats a source without an after-standby choice as full term after standby', () => {
    const loan: FundingSource = {
      type: 'seller_financing',
      amount: 120_000,
      rate: 0,
      term_years: 5,
      standby_months: 18,
    };
    expect(debtService([loan])).toEqual([0, 12_000, 24_000]);
  });

  it('amortizes over the term left after standby when standby eats into the term', () => {
    const loan: FundingSource = {
      type: 'seller_financing',
      amount: 120_000,
      rate: 0,
      term_years: 5,
      standby_months: 18,
      after_standby: 'remaining_term',
    };
    const [year1, year2, year3] = debtService([loan]);
    expect(year1).toBe(0);
    expect(year2).toBeCloseTo((120_000 / 42) * 6, 6);
    expect(year3).toBeCloseTo((120_000 / 42) * 12, 6);
  });

  it('accrues interest through a 24-month standby and amortizes the grown balance', () => {
    const loan = (
      after_standby: FundingSource['after_standby'],
    ): FundingSource => ({
      type: 'seller_financing',
      amount: 100_000,
      rate: 0.12,
      term_years: 10,
      standby_months: 24,
      after_standby,
    });
    const full = debtService([loan('full_term_after_standby')]);
    const remaining = debtService([loan('remaining_term')]);
    expect(full[0]).toBe(0);
    expect(full[1]).toBe(0);
    expect(full[2]).toBeCloseTo(21_860.4, 1);
    expect(remaining[2]).toBeCloseTo(24_764.16, 1);
  });

  it('lists debt service per source in input order and totals them', () => {
    const sources: FundingSource[] = [
      { type: 'sba_7a', amount: 360_000, rate: 0, term_years: 10 },
      { type: 'cash_equity', amount: 50_000 },
      { type: 'conventional', amount: 36_000, rate: 0, term_years: 2 },
    ];
    expect(bySource(sources)).toEqual([
      [36_000, 0, 18_000],
      [36_000, 0, 18_000],
      [36_000, 0, 0],
    ]);
    expect(debtService(sources)).toEqual([54_000, 54_000, 36_000]);
  });
});

describe('threeYearProjection coverage', () => {
  const loan: FundingSource = {
    type: 'sba_7a',
    amount: 360_000,
    rate: 0,
    term_years: 10,
  };

  it('grows SDE by the growth rate and derives DSCR and net cash flow per year', () => {
    const years = threeYearProjection({
      sde: 100_000,
      annualGrowth: 0.1,
      sources: [loan],
      dscrOptions: { mode: 'tax_adjusted', taxRate: 0 },
      basis: MONTHS_FROM_CLOSE,
    });
    expect(years.map((year) => year.year)).toEqual([1, 2, 3]);
    expect(years[0]!.sde).toBe(100_000);
    expect(years[1]!.sde).toBeCloseTo(110_000, 6);
    expect(years[2]!.sde).toBeCloseTo(121_000, 6);
    expect(years[0]!.dscr).toBeCloseTo(100_000 / 36_000, 6);
    expect(years[2]!.dscr).toBeCloseTo(121_000 / 36_000, 6);
    expect(years[0]!.net_cash_flow).toBe(64_000);
    expect(years[2]!.net_cash_flow).toBeCloseTo(85_000, 6);
  });

  it('applies the SBA-standard DSCR mode to every year', () => {
    const years = threeYearProjection({
      sde: 100_000,
      annualGrowth: 0,
      sources: [loan],
      dscrOptions: { mode: 'sba_standard', ownerSalary: 10_000 },
      basis: MONTHS_FROM_CLOSE,
    });
    expect(years.map((year) => year.dscr)).toEqual([2.5, 2.5, 2.5]);
  });
});

describe('deriveBuyerEquity', () => {
  const stack = {
    purchase_price: 619_150,
    closing_costs: 41_000,
    funding_sources: [
      { type: 'sba_7a', amount: 552_150, rate: 0.115, term_years: 10 },
      { type: 'cash_equity', amount: 108_000 },
    ] as FundingSource[],
  };

  it('derives equity as total uses less debt-classified sources', () => {
    expect(deriveBuyerEquity(stack)).toBe(108_000);
  });

  it('adds working capital to uses when present', () => {
    expect(deriveBuyerEquity({ ...stack, working_capital: 25_000 })).toBe(
      133_000,
    );
  });

  it('treats an other source as debt', () => {
    expect(
      deriveBuyerEquity({
        ...stack,
        funding_sources: [
          { type: 'sba_7a', amount: 552_150 },
          { type: 'other', amount: 108_000 },
        ] as FundingSource[],
      }),
    ).toBe(0);
  });
});

describe('tenYearProForma', () => {
  const sources: FundingSource[] = [
    { type: 'sba_7a', amount: 360_000, rate: 0, term_years: 10 },
    {
      type: 'seller_financing',
      amount: 120_000,
      rate: 0,
      term_years: 5,
      standby_months: 18,
    },
  ];

  it("subtracts each year's own debt service, through standby and term end", () => {
    expect(
      tenYearProForma({
        sde: 100_000,
        annualGrowth: 0,
        sources,
        dscrOptions: {},
        basis: MONTHS_FROM_CLOSE,
      }),
    ).toEqual([
      64_000, 52_000, 40_000, 40_000, 40_000, 40_000, 52_000, 64_000, 64_000,
      64_000,
    ]);
  });

  it('follows the fiscal year basis and grows SDE each year', () => {
    const projection = tenYearProForma({
      sde: 100_000,
      annualGrowth: 0.1,
      sources: [sources[0]!],
      dscrOptions: {},
      basis: {
        kind: 'fiscal_year',
        close_date: '2026-03-15',
        fiscal_year_end_month: 12,
      },
    });
    expect(projection[0]).toBe(73_000);
    expect(projection[1]).toBeCloseTo(74_000, 6);
    expect(projection[10 - 1]).toBeCloseTo(100_000 * 1.1 ** 9 - 36_000, 6);
  });
});

describe('dscrSensitivity', () => {
  it('recomputes DSCR across a -50%..+50% SDE band against the 1.25x line', () => {
    const band = dscrSensitivity(163_000, 103_279, {
      mode: 'tax_adjusted',
      taxRate: 0.2564,
    });

    expect(band.map((point) => point.scale)).toEqual([-0.5, -0.25, 0, 0.25, 0.5]);

    const base = band.find((point) => point.scale === 0)!;
    expect(round2(base.dscr!)).toBe(1.43);
    expect(base.meets_reference).toBe(true);
  });
});

describe('threeYearProjection on fiscal years', () => {
  const debtService = (basis: YearBasis, sources: FundingSource[]) =>
    threeYearProjection({
      sde: 0,
      annualGrowth: 0,
      sources,
      dscrOptions: {},
      basis,
    }).map((year) => year.debt_service);
  const sba: FundingSource = {
    type: 'sba_7a',
    amount: 360_000,
    rate: 0,
    term_years: 10,
  };

  it('runs year 1 from close through the first fiscal year end, first payment the month after close', () => {
    const basis: YearBasis = {
      kind: 'fiscal_year',
      close_date: '2026-03-15',
      fiscal_year_end_month: 12,
    };
    expect(debtService(basis, [sba])).toEqual([27_000, 36_000, 36_000]);
  });

  it('places a standby ending at month 18 inside fiscal year 2', () => {
    const basis: YearBasis = {
      kind: 'fiscal_year',
      close_date: '2026-03-15',
      fiscal_year_end_month: 12,
    };
    const note: FundingSource = {
      type: 'seller_financing',
      amount: 120_000,
      rate: 0,
      term_years: 5,
      standby_months: 18,
    };
    expect(debtService(basis, [note])).toEqual([0, 6_000, 24_000]);
  });

  it('gives year 1 no payments when close falls in the fiscal year end month', () => {
    const basis: YearBasis = {
      kind: 'fiscal_year',
      close_date: '2026-12-10',
      fiscal_year_end_month: 12,
    };
    expect(debtService(basis, [sba])).toEqual([0, 36_000, 36_000]);
  });

  it('sets full annual SDE against the short year 1 and grows it for years 2 and 3', () => {
    const years = threeYearProjection({
      sde: 100_000,
      annualGrowth: 0.1,
      sources: [sba],
      dscrOptions: { mode: 'tax_adjusted', taxRate: 0 },
      basis: {
        kind: 'fiscal_year',
        close_date: '2026-03-15',
        fiscal_year_end_month: 12,
      },
    });
    expect(years[0].sde).toBe(100_000);
    expect(years[0].dscr).toBeCloseTo(100_000 / 27_000, 6);
    expect(years[0].net_cash_flow).toBe(73_000);
    expect(years[2].sde).toBeCloseTo(121_000, 6);
  });

  it('refuses a fiscal year without a close date or fiscal year end', () => {
    expect(
      yearBasisSchema.safeParse({ kind: 'fiscal_year', fiscal_year_end_month: 12 })
        .success,
    ).toBe(false);
    expect(
      yearBasisSchema.safeParse({ kind: 'fiscal_year', close_date: '2026-03-15' })
        .success,
    ).toBe(false);
  });
});

describe('scenarioPathDriversSchema', () => {
  const drivers = {
    revenue_loss: 0.1,
    growth: 0,
    margin_change: -0.02,
    rate_shift: 0.02,
  };

  it('accepts worst and great drivers', () => {
    expect(
      scenarioPathDriversSchema.parse({ worst: drivers, great: drivers }),
    ).toEqual({ worst: drivers, great: drivers });
  });

  it('refuses revenue lost outside 0 to 100%', () => {
    for (const revenue_loss of [-0.01, 1.01]) {
      expect(
        scenarioPathDriversSchema.safeParse({
          worst: { ...drivers, revenue_loss },
          great: drivers,
        }).success,
      ).toBe(false);
    }
    for (const revenue_loss of [0, 1]) {
      expect(
        scenarioPathDriversSchema.safeParse({
          worst: { ...drivers, revenue_loss },
          great: drivers,
        }).success,
      ).toBe(true);
    }
  });

  it('refuses a path missing a driver', () => {
    const { rate_shift: _omitted, ...partial } = drivers;
    expect(
      scenarioPathDriversSchema.safeParse({ worst: partial, great: drivers })
        .success,
    ).toBe(false);
  });
});
