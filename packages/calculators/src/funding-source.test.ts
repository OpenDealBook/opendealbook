import { describe, expect, it } from 'vitest';

import { fundingSourceSchema } from './funding-source';

describe('fundingSourceSchema', () => {
  it('accepts a minimal source and an SBA source with financing terms', () => {
    expect(
      fundingSourceSchema.parse({ type: 'cash_equity', amount: 108_000 }),
    ).toEqual({ type: 'cash_equity', amount: 108_000 });

    const sba = fundingSourceSchema.parse({
      type: 'sba_7a',
      amount: 552_150,
      rate: 0.115,
      term_years: 10,
      guarantee_fee: 16_565,
      standby_months: 0,
    });
    expect(sba.type).toBe('sba_7a');
    expect(sba.term_years).toBe(10);
  });

  it('refuses a remaining-term standby as long as the loan term', () => {
    const result = fundingSourceSchema.safeParse({
      type: 'seller_financing',
      amount: 120_000,
      rate: 0.08,
      term_years: 5,
      standby_months: 60,
      after_standby: 'remaining_term',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      "Standby can't be as long as the loan term when payments count from close.",
    ]);
  });

  it('accepts a remaining-term standby shorter than the term, and any standby on full term', () => {
    const loan = {
      type: 'seller_financing',
      amount: 120_000,
      rate: 0.08,
      term_years: 5,
    } as const;

    expect(
      fundingSourceSchema.safeParse({
        ...loan,
        standby_months: 59,
        after_standby: 'remaining_term',
      }).success,
    ).toBe(true);
    expect(
      fundingSourceSchema.safeParse({
        ...loan,
        standby_months: 60,
        after_standby: 'full_term_after_standby',
      }).success,
    ).toBe(true);
  });

  it('rejects an unknown funding type', () => {
    expect(() =>
      fundingSourceSchema.parse({ type: 'crypto', amount: 1 }),
    ).toThrow();
  });
});
