import { describe, expect, it } from 'vitest';
import {
  anonymizeClosedDeal,
  businessAgeBand,
  coarsenGeography,
  employeeBand,
  generatePseudonym,
  industryShortName,
  roundMoney,
  roundPercentTo5,
  roundServiceMix,
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
