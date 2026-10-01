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

  it('rejects an unknown funding type', () => {
    expect(() =>
      fundingSourceSchema.parse({ type: 'crypto', amount: 1 }),
    ).toThrow();
  });
});
