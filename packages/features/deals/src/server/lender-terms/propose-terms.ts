import type { FundingSource, FundingSourceType } from '@odb/calculators';

import type { DealTermsSoughtPayload } from './lender-terms.schema';

const LOAN_TYPES: ReadonlySet<FundingSourceType> = new Set([
  'sba_7a',
  'sba_504',
  'conventional',
]);

export type ProposedTerms = Omit<DealTermsSoughtPayload, 'deal_id' | 'notes'>;

export function proposeTermsFromFundingSources(
  sources: FundingSource[],
): ProposedTerms {
  const loan = sources
    .filter((source) => LOAN_TYPES.has(source.type))
    .reduce<FundingSource | undefined>(
      (largest, source) =>
        largest === undefined || source.amount > largest.amount
          ? source
          : largest,
      undefined,
    );
  const sellerNotes = sources.filter(
    (source) => source.type === 'seller_financing',
  );

  return {
    loan_amount: loan?.amount ?? null,
    loan_type: loan?.type ?? null,
    term_years: loan?.term_years ?? null,
    rate_type: null,
    seller_note_amount:
      sellerNotes.length === 0
        ? null
        : sellerNotes.reduce((sum, source) => sum + source.amount, 0),
  };
}
