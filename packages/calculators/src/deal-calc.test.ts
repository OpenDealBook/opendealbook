import { describe, expect, it } from 'vitest';

import {
  amortizeMonthlyPayment,
  dealBoxGap,
  debtServiceYear1,
  deriveBuyerEquity,
  dscr,
  dscrSensitivity,
  ebitda,
  netCashFlow,
  netIncome,
  paybackYears,
  proForma,
  purchaseMultiple,
  revenueDropBeforeUnderwater,
  sdeFromPl,
  type ProfitAndLoss,
} from './deal-calc';
import type { FundingSource } from './funding-source';

const round2 = (value: number) => Number(value.toFixed(2));

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

describe('debtServiceYear1 with seller-note standby', () => {
  const note = (standby_months?: number): FundingSource => ({
    type: 'seller_financing',
    amount: 200_000,
    rate: 0.08,
    term_years: 5,
    standby_months,
  });

  it('contributes nothing in year one when the full year is on standby', () => {
    expect(debtServiceYear1([note(12)])).toBe(0);
  });

  it('pays only the post-standby months on the accrued balance', () => {
    expect(debtServiceYear1([note(6)])).toBeCloseTo(25_321.31, 2);
  });

  it('matches the old full-year sum when there is no standby', () => {
    expect(debtServiceYear1([note(0)])).toBeCloseTo(
      amortizeMonthlyPayment(200_000, 0.08, 60) * 12,
      6,
    );
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

describe('proForma', () => {
  it('projects net cash flow forward at the annual growth rate', () => {
    expect(proForma(100_000, 0.1, 40_000, 3).map(Math.round)).toEqual([
      60_000, 70_000, 81_000,
    ]);
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
