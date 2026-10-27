import { describe, expect, it } from 'vitest';

import {
  bestCandidate,
  matchKey,
  matchOutcome,
  nameSimilarity,
  normalizeName,
  postalCode,
  streetNumber,
} from './matcher';

describe('normalizeName', () => {
  it.each([
    ['Acme Plumbing, LLC', 'acme plumbing'],
    ['ACME PLUMBING L.L.C.', 'acme plumbing'],
    ['The Acme Plumbing Company', 'acme plumbing'],
    ['Acme Plumbing Co., Inc.', 'acme plumbing'],
    ['Acme Plumbing Corp.', 'acme plumbing'],
    ['Acme Plumbing Corporation', 'acme plumbing'],
    ['Acme Plumbing Incorporated', 'acme plumbing'],
    ['Acme Plumbing Ltd', 'acme plumbing'],
    ['Acme Plumbing Limited', 'acme plumbing'],
    ['Acme Plumbing, L.P.', 'acme plumbing'],
    ['Acme Plumbing LLP', 'acme plumbing'],
    ['Acme Plumbing PLLC', 'acme plumbing'],
    ['Smith & Sons Mfg', 'smith and sons manufacturing'],
    ['Smith and Sons Manufacturing', 'smith and sons manufacturing'],
    ["O'Brien Bros. Svcs", 'obrien brothers services'],
    ['Ridge Mgmt Assoc Intl', 'ridge management associates international'],
    ['  Lakeside   Dental-Care ', 'lakeside dental care'],
    ['Theater Supply Inc', 'theater supply'],
    ['Co-op Grocers LLC', 'co op grocers'],
    ['Lakeside Dental PC', 'lakeside dental'],
    ['Lakeside Dental P.C.', 'lakeside dental'],
    ['Harbor Shipping PLC', 'harbor shipping'],
    ['Acme Holdings LLC dba Acme Plumbing', 'acme holdings'],
    ['ACME HOLDINGS LLC D/B/A ACME PLUMBING', 'acme holdings'],
    ['Acme Holdings, LLC, DBA Acme Plumbing', 'acme holdings'],
    ['Dbal Robotics Inc', 'dbal robotics'],
  ])('%s normalizes to %s', (raw, normalized) => {
    expect(normalizeName(raw)).toBe(normalized);
  });
});

describe('streetNumber', () => {
  it.each([
    ['123 Main St', '123'],
    ['123A Main St', '123'],
    ['45-10 Broadway', '45-10'],
    ['  9 Elm Ave Suite 200', '9'],
    ['PO Box 77', null],
    ['P.O. Box 77', null],
    ['One Main Street', null],
    ['Main St', null],
    [null, null],
  ])('%s has street number %s', (line, number) => {
    expect(streetNumber(line)).toBe(number);
  });
});

describe('postalCode', () => {
  it.each([
    ['78701', '78701'],
    ['78701-1234', '78701'],
    ['787011234', '78701'],
    ['2134', '02134'],
    ['  02134 ', '02134'],
    ['abc', null],
    ['', null],
    [null, null],
  ])('%s is postal code %s', (raw, postal) => {
    expect(postalCode(raw)).toBe(postal);
  });
});

describe('matchKey', () => {
  it('joins postal code, street number and normalized name', () => {
    expect(
      matchKey({ name: 'Acme Plumbing, LLC', addressLine1: '12 Congress Ave', postalCode: '78701-0001' }),
    ).toBe('78701|12|acme plumbing');
  });

  it('is the same for two spellings of one business at one address', () => {
    expect(
      matchKey({ name: 'THE ACME PLUMBING CO.', addressLine1: '12 Congress Avenue Ste 4', postalCode: '78701' }),
    ).toBe(matchKey({ name: 'Acme Plumbing LLC', addressLine1: '12 Congress Ave', postalCode: '78701' }));
  });

  it.each([
    [{ name: 'Acme', addressLine1: 'PO Box 9', postalCode: '78701' }],
    [{ name: 'Acme', addressLine1: '12 Congress Ave', postalCode: null }],
    [{ name: 'LLC', addressLine1: '12 Congress Ave', postalCode: '78701' }],
  ])('is absent without a street number, postal code or name: %o', (record) => {
    expect(matchKey(record)).toBeNull();
  });
});

describe('nameSimilarity', () => {
  it('is 1 for names that normalize the same', () => {
    expect(nameSimilarity('Acme Plumbing LLC', 'ACME PLUMBING, INC.')).toBe(1);
  });

  it('is symmetric', () => {
    expect(nameSimilarity('Acme Plumbing', 'Acme Plumbing and Heating')).toBe(
      nameSimilarity('Acme Plumbing and Heating', 'Acme Plumbing'),
    );
  });

  it('links a one-letter typo', () => {
    expect(nameSimilarity('Lakeside Dental Care', 'Lakeside Dentl Care')).toBeGreaterThanOrEqual(0.9);
  });

  it('reviews a name that adds a trade', () => {
    const score = nameSimilarity('Acme Plumbing', 'Acme Plumbing and Heating');
    expect(score).toBeGreaterThanOrEqual(0.6);
    expect(score).toBeLessThan(0.9);
  });

  it('drops an unrelated business at the same address', () => {
    expect(nameSimilarity('Acme Plumbing', 'Golden Dragon Restaurant')).toBeLessThan(0.6);
  });
});

describe('matchOutcome', () => {
  it.each([
    [1, 'link'],
    [0.9, 'link'],
    [0.8999, 'review'],
    [0.6, 'review'],
    [0.5999, 'drop'],
    [0, 'drop'],
  ])('a score of %s is %s', (score, outcome) => {
    expect(matchOutcome(score)).toBe(outcome);
  });
});

describe('bestCandidate', () => {
  it('picks the highest scoring business', () => {
    expect(
      bestCandidate('Acme Plumbing', [
        { id: 'b', name: 'Golden Dragon Restaurant' },
        { id: 'a', name: 'Acme Plumbing LLC' },
      ]),
    ).toEqual({ id: 'a', name: 'Acme Plumbing LLC', score: 1 });
  });

  it('breaks a tie by business id', () => {
    expect(
      bestCandidate('Acme Plumbing', [
        { id: 'z', name: 'Acme Plumbing Inc' },
        { id: 'a', name: 'Acme Plumbing LLC' },
      ]),
    ).toEqual({ id: 'a', name: 'Acme Plumbing LLC', score: 1 });
  });

  it('is absent with no candidates', () => {
    expect(bestCandidate('Acme Plumbing', [])).toBeNull();
  });
});
