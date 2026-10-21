import { describe, expect, it } from 'vitest';

import type { FundingSource } from '@odb/calculators';

import { proposeTermsFromFundingSources } from './propose-terms';

const empty = {
  loan_amount: null,
  loan_type: null,
  term_years: null,
  rate_type: null,
  seller_note_amount: null,
};

describe('proposeTermsFromFundingSources', () => {
  it('proposes nothing when the calc has no sources', () => {
    expect(proposeTermsFromFundingSources([])).toEqual(empty);
  });

  it('takes loan fields from the largest debt source and the note from seller financing', () => {
    const sources: FundingSource[] = [
      { type: 'conventional', amount: 100_000, term_years: 5 },
      { type: 'sba_7a', amount: 800_000, term_years: 10, rate: 0.11 },
      { type: 'seller_financing', amount: 900_000, term_years: 7 },
      { type: 'cash_equity', amount: 2_000_000 },
    ];

    expect(proposeTermsFromFundingSources(sources)).toEqual({
      loan_amount: 800_000,
      loan_type: 'sba_7a',
      term_years: 10,
      rate_type: null,
      seller_note_amount: 900_000,
    });
  });

  it('leaves the loan empty when only equity and seller financing exist', () => {
    const sources: FundingSource[] = [
      { type: 'investor_equity', amount: 500_000 },
      { type: 'seller_financing', amount: 300_000 },
    ];

    expect(proposeTermsFromFundingSources(sources)).toEqual({
      ...empty,
      seller_note_amount: 300_000,
    });
  });

  it('leaves term empty when the largest debt source has none', () => {
    expect(
      proposeTermsFromFundingSources([{ type: 'sba_504', amount: 50_000 }]),
    ).toEqual({ ...empty, loan_amount: 50_000, loan_type: 'sba_504' });
  });

  it('ignores heloc, mezzanine, and other as loans', () => {
    expect(
      proposeTermsFromFundingSources([
        { type: 'heloc', amount: 90_000 },
        { type: 'mezzanine', amount: 80_000 },
        { type: 'other', amount: 70_000 },
      ]),
    ).toEqual(empty);
  });

  it('sums every seller financing source into the seller note', () => {
    expect(
      proposeTermsFromFundingSources([
        { type: 'seller_financing', amount: 100_000 },
        { type: 'seller_financing', amount: 50_000 },
      ]),
    ).toEqual({ ...empty, seller_note_amount: 150_000 });
  });
});
