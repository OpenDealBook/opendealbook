import { describe, expect, it } from 'vitest';

import {
  OFFER_TERMS_SCHEMA_VERSION,
  diffOfferTerms,
  offerTermsSchema,
  offerVersionSchema,
  type OfferTerms,
} from './offer.schema';

const fullTerms = {
  purchase_price: 1_800_000,
  real_estate_portion: 400_000,
  inventory_treatment: 'at_cost' as const,
  inventory_cap: 50_000,
  valuation_basis: 'calc_v3',
  cash_at_close: 1_200_000,
  earnout: {
    amount: 200_000,
    months: 24,
    metric: 'sde',
    targets: [100_000, 120_000],
    note: 'paid annually',
  },
  ar_included: true,
  ap_assumed: false,
  working_capital_peg: 90_000,
  working_capital_mechanism: 'peg' as const,
  funding_sources: [
    { type: 'sba_7a' as const, amount: 1_440_000 },
    { type: 'cash_equity' as const, amount: 360_000 },
  ],
  seller_note: { amount: 180_000, rate: 8, term_years: 5, standby_months: 24 },
  earnest_deposit: { amount: 25_000, due_days: 5 },
  escrow_holdback: { basis: 'pct' as const, value: 10, months: 12 },
  exclusivity_days: 45,
  diligence_days: 60,
  target_close_date: '2026-12-01',
  offer_expires_at: '2026-10-15T17:00:00Z',
  contingencies: [
    { type: 'financing' as const },
    { type: 'due_diligence' as const, note: 'quality of earnings' },
  ],
  non_compete: { years: 5, radius: '25 miles', scope: 'accounting services' },
  training_period: { length: '90 days', paid: true },
  seller_agreement: { kind: 'consulting' as const, months: 6, pay: 5_000 },
  key_employees: ['controller', 'senior manager'],
  confidentiality: 'mutual NDA survives closing',
  other_terms: 'assignable lease required',
};

describe('offerTermsSchema', () => {
  it('parses a full valid offer and stamps the schema version', () => {
    const parsed = offerTermsSchema.parse(fullTerms);
    expect(parsed.purchase_price).toBe(1_800_000);
    expect(parsed.schema_version).toBe(OFFER_TERMS_SCHEMA_VERSION);
  });

  it('requires purchase_price', () => {
    const { purchase_price, ...withoutPrice } = fullTerms;
    expect(offerTermsSchema.safeParse(withoutPrice).success).toBe(false);
  });

  it('rejects purchase_price that is not positive', () => {
    expect(
      offerTermsSchema.safeParse({ ...fullTerms, purchase_price: 0 }).success,
    ).toBe(false);
  });

  it('rejects an invalid inventory_treatment enum', () => {
    expect(
      offerTermsSchema.safeParse({
        ...fullTerms,
        inventory_treatment: 'donated',
      }).success,
    ).toBe(false);
  });

  it('rejects an invalid contingency type', () => {
    expect(
      offerTermsSchema.safeParse({
        ...fullTerms,
        contingencies: [{ type: 'weather' }],
      }).success,
    ).toBe(false);
  });
});

describe('offerVersionSchema', () => {
  it('parses a version envelope wrapping terms', () => {
    const parsed = offerVersionSchema.parse({
      number: 1,
      author_side: 'buyer',
      purchase_price: 1_800_000,
      exclusivity_days: 45,
      terms: fullTerms,
    });
    expect(parsed.number).toBe(1);
    expect(parsed.author_side).toBe('buyer');
    expect(parsed.terms.schema_version).toBe(OFFER_TERMS_SCHEMA_VERSION);
  });

  it('rejects an invalid author_side', () => {
    expect(
      offerVersionSchema.safeParse({
        number: 1,
        author_side: 'broker',
        purchase_price: 1_800_000,
        terms: fullTerms,
      }).success,
    ).toBe(false);
  });
});

describe('diffOfferTerms', () => {
  const base = offerTermsSchema.parse(fullTerms);

  it('reports no diff for identical terms', () => {
    expect(diffOfferTerms(base, base)).toEqual([]);
  });

  it('detects a changed purchase_price', () => {
    const next: OfferTerms = { ...base, purchase_price: 1_900_000 };
    expect(diffOfferTerms(base, next)).toEqual([
      { path: 'purchase_price', before: 1_800_000, after: 1_900_000 },
    ]);
  });

  it('detects an added contingency', () => {
    const next: OfferTerms = {
      ...base,
      contingencies: [
        ...base.contingencies!,
        { type: 'landlord_approval' },
      ],
    };
    expect(diffOfferTerms(base, next)).toEqual([
      {
        path: 'contingencies',
        before: base.contingencies,
        after: next.contingencies,
      },
    ]);
  });

  it('detects a changed non_compete term', () => {
    const next: OfferTerms = {
      ...base,
      non_compete: { ...base.non_compete!, years: 3 },
    };
    expect(diffOfferTerms(base, next)).toEqual([
      { path: 'non_compete.years', before: 5, after: 3 },
    ]);
  });

  it('orders diffs deterministically by path', () => {
    const next: OfferTerms = {
      ...base,
      purchase_price: 2_000_000,
      diligence_days: 30,
    };
    const diffs = diffOfferTerms(base, next);
    expect(diffs.map((d) => d.path)).toEqual([
      'diligence_days',
      'purchase_price',
    ]);
  });
});
