import { describe, expect, it } from 'vitest';

import {
  DEALSTATS_CONTRIBUTOR_FIELDS,
  buildDealStatsContributorPackage,
  type ContributorDealInput,
} from './dealstats-contributor';

const deal: ContributorDealInput = {
  businessDescription: 'Two-partner CPA firm, tax and advisory',
  naicsCode: '541211',
  sicCode: '8721',
  saleDate: '2025-11-30',
  transactionType: 'Asset',
  salePrice: 1_250_000,
  revenue: 900_000,
  sde: 380_000,
  ebitda: 300_000,
  ownerCompensation: 180_000,
  state: 'CA',
};

describe('buildDealStatsContributorPackage', () => {
  it('maps closed-deal facts to the DealStats contributor field labels', () => {
    const pkg = buildDealStatsContributorPackage(deal);
    expect(pkg.vendor).toBe('DealStats');
    expect(pkg.format).toBe('contributor-v1');
    expect(pkg.fields['NAICS']).toBe('541211');
    expect(pkg.fields['Sale Date']).toBe('2025-11-30');
    expect(pkg.fields['Transaction Type']).toBe('Asset');
    expect(pkg.fields['MVIC Price']).toBe(1_250_000);
    expect(pkg.fields['Net Sales']).toBe(900_000);
    expect(pkg.fields['SDE']).toBe(380_000);
    expect(pkg.fields['EBITDA']).toBe(300_000);
  });

  it('reports which submitted fields are unverified against public BVR docs', () => {
    const pkg = buildDealStatsContributorPackage(deal);
    const verifiedLabels = DEALSTATS_CONTRIBUTOR_FIELDS.filter((f) => f.verified).map((f) => f.label);
    const unverifiedLabels = DEALSTATS_CONTRIBUTOR_FIELDS.filter((f) => !f.verified).map((f) => f.label);
    expect(verifiedLabels).toContain('MVIC Price');
    expect(verifiedLabels).toContain('NAICS');
    expect(unverifiedLabels.length).toBeGreaterThan(0);
    expect(pkg.unverifiedFields).toEqual(unverifiedLabels);
  });
});
