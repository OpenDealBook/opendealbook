import { describe, expect, it } from 'vitest';
import {
  anonymizeClosedDeal,
  anonymizeCloseComp,
  anonymizeDealActivity,
  businessAgeBand,
  coarsenGeography,
  compPoolEligible,
  employeeBand,
  fiscalQuarter,
  generatePseudonym,
  industryShortName,
  naics3,
  poolFingerprint,
  roundMoney,
  roundPercentTo5,
  roundServiceMix,
  type DealActivityRecord,
} from './anonymize';

describe('roundMoney', () => {
  it('rounds to nearest 10K under 1M, half up', () => {
    expect(roundMoney(994_000)).toBe(990_000);
    expect(roundMoney(25_000)).toBe(30_000);
    expect(roundMoney(999_999)).toBe(1_000_000);
  });

  it('rounds to nearest 50K in the 1M to 5M band, half up', () => {
    expect(roundMoney(1_020_000)).toBe(1_000_000);
    expect(roundMoney(1_025_000)).toBe(1_050_000);
    expect(roundMoney(1_000_000)).toBe(1_000_000);
    expect(roundMoney(4_990_000)).toBe(5_000_000);
  });

  it('rounds to nearest 100K above 5M, half up', () => {
    expect(roundMoney(5_000_000)).toBe(5_000_000);
    expect(roundMoney(6_040_000)).toBe(6_000_000);
    expect(roundMoney(6_050_000)).toBe(6_100_000);
  });
});

describe('roundPercentTo5', () => {
  it('rounds to the nearest 5 percent, half up', () => {
    expect(roundPercentTo5(12.5)).toBe(15);
    expect(roundPercentTo5(12.4)).toBe(10);
    expect(roundPercentTo5(7)).toBe(5);
    expect(roundPercentTo5(0)).toBe(0);
    expect(roundPercentTo5(100)).toBe(100);
  });
});

describe('roundServiceMix', () => {
  it('rounds each share to the nearest 10 percent independently', () => {
    expect(roundServiceMix({ tax: 44, bookkeeping: 31, advisory: 25 })).toEqual({
      tax: 40,
      bookkeeping: 30,
      advisory: 30,
    });
  });
});

describe('employeeBand', () => {
  it('maps head counts to fixed bands', () => {
    expect(employeeBand(1)).toBe('1-4');
    expect(employeeBand(4)).toBe('1-4');
    expect(employeeBand(5)).toBe('5-9');
    expect(employeeBand(9)).toBe('5-9');
    expect(employeeBand(10)).toBe('10-19');
    expect(employeeBand(19)).toBe('10-19');
    expect(employeeBand(20)).toBe('20-49');
    expect(employeeBand(49)).toBe('20-49');
    expect(employeeBand(50)).toBe('50+');
    expect(employeeBand(120)).toBe('50+');
  });
});

describe('businessAgeBand', () => {
  it('maps years in operation to fixed bands', () => {
    expect(businessAgeBand(4)).toBe('<5');
    expect(businessAgeBand(4.9)).toBe('<5');
    expect(businessAgeBand(5)).toBe('5-10');
    expect(businessAgeBand(10)).toBe('5-10');
    expect(businessAgeBand(10.1)).toBe('10-20');
    expect(businessAgeBand(20)).toBe('10-20');
    expect(businessAgeBand(20.1)).toBe('20+');
    expect(businessAgeBand(35)).toBe('20+');
  });
});

describe('industryShortName', () => {
  it('maps the seeded 5412 NAICS codes to short names', () => {
    expect(industryShortName('541211')).toBe('CPA Firm');
    expect(industryShortName('541213')).toBe('Tax Practice');
    expect(industryShortName('541214')).toBe('Payroll');
    expect(industryShortName('541219')).toBe('Bookkeeping');
  });

  it('throws on an unseeded NAICS code', () => {
    expect(() => industryShortName('999999')).toThrow();
  });
});

describe('generatePseudonym', () => {
  it('formats as <state> <industry short name> <sequence>', () => {
    expect(
      generatePseudonym({ state: 'CA', industryShortName: 'CPA Firm', sequence: 42 }),
    ).toBe('CA CPA Firm 42');
  });

  it('uses the supplied global sequence verbatim regardless of state or industry', () => {
    expect(
      generatePseudonym({ state: 'TX', industryShortName: 'Payroll', sequence: 42 }),
    ).toBe('TX Payroll 42');
    expect(
      generatePseudonym({ state: 'CA', industryShortName: 'CPA Firm', sequence: 42 }),
    ).toBe('CA CPA Firm 42');
  });
});

describe('coarsenGeography', () => {
  it('keeps a CBSA code and buckets a missing one as rural', () => {
    expect(coarsenGeography('31080')).toBe('31080');
    expect(coarsenGeography(null)).toBe('rural');
  });
});

describe('anonymizeClosedDeal', () => {
  it('produces the anonymized comp shape with rounded values and recomputed multiples', () => {
    const result = anonymizeClosedDeal(
      {
        state: 'CA',
        naics: '541211',
        salePrice: 1_020_000,
        revenue: 505_000,
        sde: 210_000,
        ebitda: 180_000,
        structure: { cashAtClose: 62, sellerNote: 23, earnout: 15 },
        employees: 7,
        businessAgeYears: 12,
        serviceMix: { tax: 44, bookkeeping: 31, advisory: 25 },
        cbsa: '31080',
      },
      42,
    );

    expect(result.pseudonym).toBe('CA CPA Firm 42');
    expect(result.salePrice).toBe(1_000_000);
    expect(result.revenue).toBe(510_000);
    expect(result.sde).toBe(210_000);
    expect(result.ebitda).toBe(180_000);
    expect(result.multPriceRevenue).toBeCloseTo(1_000_000 / 510_000, 10);
    expect(result.multPriceSde).toBeCloseTo(1_000_000 / 210_000, 10);
    expect(result.multPriceEbitda).toBeCloseTo(1_000_000 / 180_000, 10);
    expect(result.structure).toEqual({ cashAtClose: 60, sellerNote: 25, earnout: 15 });
    expect(result.employeeBand).toBe('5-9');
    expect(result.businessAgeBand).toBe('10-20');
    expect(result.serviceMix).toEqual({ tax: 40, bookkeeping: 30, advisory: 30 });
    expect(result.geography).toBe('31080');
    expect(result.state).toBe('CA');
    expect(result.industryShortName).toBe('CPA Firm');
  });

  it('is deterministic for identical inputs', () => {
    const record = {
      state: 'TX',
      naics: '541213',
      salePrice: 640_000,
      revenue: 480_000,
      sde: 190_000,
      ebitda: 150_000,
      structure: { cashAtClose: 80, sellerNote: 20 },
      employees: 3,
      businessAgeYears: 22,
      serviceMix: { tax: 90, advisory: 10 },
      cbsa: null,
    };
    expect(anonymizeClosedDeal(record, 7)).toEqual(anonymizeClosedDeal(record, 7));
    expect(anonymizeClosedDeal(record, 7).geography).toBe('rural');
  });
});

describe('naics3', () => {
  it('keeps the first three digits of a NAICS code', () => {
    expect(naics3('541211')).toBe('541');
    expect(naics3('561')).toBe('561');
  });
});

describe('fiscalQuarter', () => {
  it('maps a close date to a calendar quarter label', () => {
    expect(fiscalQuarter('2025-01-15')).toBe('2025-Q1');
    expect(fiscalQuarter('2025-03-31')).toBe('2025-Q1');
    expect(fiscalQuarter('2025-04-01')).toBe('2025-Q2');
    expect(fiscalQuarter('2025-09-30')).toBe('2025-Q3');
    expect(fiscalQuarter('2025-12-31')).toBe('2025-Q4');
  });
});

describe('poolFingerprint', () => {
  it('is deterministic for the same anonymized identity', () => {
    const parts = { region: 'TX', naics: '541', quarter: '2025-Q4' };
    expect(poolFingerprint(parts)).toBe(poolFingerprint(parts));
  });

  it('differs when the identity differs', () => {
    expect(poolFingerprint({ region: 'TX', naics: '541', quarter: '2025-Q4' })).not.toBe(
      poolFingerprint({ region: 'CA', naics: '541', quarter: '2025-Q4' }),
    );
  });
});

describe('anonymizeDealActivity', () => {
  const base: DealActivityRecord = {
    region: 'Austin',
    naics: '541211',
    industryShort: 'CPA Firm',
    createdAt: '2025-11-30',
    confidence: 'screened',
    askingPrice: 994_000,
    loiPrice: 1_025_000,
    furthestStage: 'loi',
    outcome: null,
    outcomeReason: null,
    lossReason: null,
  };

  it('bands prices, derives the quarter and naics3, and passes through the lifecycle fields', () => {
    expect(anonymizeDealActivity(base)).toEqual({
      region: 'Austin',
      naics3: '541',
      industryShort: 'CPA Firm',
      createdQuarter: '2025-Q4',
      confidence: 'screened',
      askingPriceBanded: 990_000,
      loiPriceBanded: 1_050_000,
      furthestStage: 'loi',
      outcome: null,
      outcomeReason: null,
      lossReason: null,
    });
  });

  it('carries null prices and a null naics through as null', () => {
    const result = anonymizeDealActivity({
      ...base,
      naics: null,
      askingPrice: null,
      loiPrice: null,
    });
    expect(result.naics3).toBeNull();
    expect(result.askingPriceBanded).toBeNull();
    expect(result.loiPriceBanded).toBeNull();
  });
});

describe('anonymizeCloseComp', () => {
  it('bands the close figures and recomputes the sde multiple from the banded values', () => {
    const result = anonymizeCloseComp({
      region: 'Dallas',
      naics: '541213',
      industryShort: 'Tax Practice',
      closeDate: '2025-11-30',
      salePrice: 1_020_000,
      revenue: 505_000,
      sde: 210_000,
      outcome: 'won',
    });
    expect(result).toEqual({
      region: 'Dallas',
      naics3: '541',
      industryShort: 'Tax Practice',
      closeQuarter: '2025-Q4',
      salePriceBanded: 1_000_000,
      revenueBanded: 510_000,
      sdeBanded: 210_000,
      sdeMultiple: 1_000_000 / 210_000,
      outcome: 'won',
    });
  });
});

describe('compPoolEligible', () => {
  it('excludes an account that has not opted in', () => {
    expect(
      compPoolEligible({ optedIn: false, outcomeReason: null, closeDate: '2025-01-01', asOf: '2026-01-01' }),
    ).toBe(false);
  });

  it('holds a lost_to_other_buyer close for two quarters, then releases it', () => {
    expect(
      compPoolEligible({
        optedIn: true,
        outcomeReason: 'lost_to_other_buyer',
        closeDate: '2025-10-01',
        asOf: '2025-12-01',
      }),
    ).toBe(false);
    expect(
      compPoolEligible({
        optedIn: true,
        outcomeReason: 'lost_to_other_buyer',
        closeDate: '2025-04-01',
        asOf: '2025-10-01',
      }),
    ).toBe(true);
  });

  it('admits an opted-in close with no hold reason', () => {
    expect(
      compPoolEligible({ optedIn: true, outcomeReason: 'closed', closeDate: '2025-10-01', asOf: '2025-10-15' }),
    ).toBe(true);
  });
});
