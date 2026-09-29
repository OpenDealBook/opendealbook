import { describe, expect, it } from 'vitest';

import {
  SBA_LOAN_TO_PRICE_DEFAULT,
  deriveSbaPrice,
  mapSbaRow,
  mapSbaRows,
  sbaUpsertKey,
  unionNaics,
} from './sba';

const sevenA: Record<string, string> = {
  Program: '7A',
  LocationID: '1234',
  BorrName: 'Acme Bookkeeping LLC',
  BorrCity: 'Austin',
  BorrState: 'TX',
  BankName: 'First National',
  GrossApproval: '$850,000',
  ApprovalDate: '3/15/2024',
  TermInMonths: '120',
  NaicsCode: '541219',
  NaicsDescription: 'Other Accounting Services',
  BusinessAge: 'Existing or more than 2 years old',
  FranchiseName: '',
  FranchiseCode: '',
};

const fiveOhFour: Record<string, string> = {
  Program: '504',
  LocationID: '9',
  BorrName: 'Ledger CPA PC',
  BorrCity: 'Reno',
  BorrState: 'NV',
  CDC_Name: 'Growth CDC',
  ThirdPartyLender_Name: 'Sierra Bank',
  ThirdPartyDollars: '$1,000,000',
  GrossApproval: '$800,000',
  ApprovalDate: '2023-06-01',
  TermInMonths: '240',
  NaicsCode: '541211',
  NaicsDescription: 'Offices of CPAs',
  BusinessAge: 'Change of Ownership',
  FranchiseName: '',
  FranchiseCode: '',
};

describe('deriveSbaPrice', () => {
  it('divides 7(a) GrossApproval by the loan-to-price ratio', () => {
    expect(
      deriveSbaPrice({ program: '7a', grossApproval: 850_000, thirdPartyDollars: null, ratio: 0.85 }),
    ).toBe(1_000_000);
  });

  it('adds ThirdPartyDollars to 504 GrossApproval (debenture-only)', () => {
    expect(
      deriveSbaPrice({ program: '504', grossApproval: 800_000, thirdPartyDollars: 1_000_000, ratio: 0.85 }),
    ).toBe(1_800_000);
  });

  it('skips a 504 loan when ThirdPartyDollars is absent', () => {
    expect(
      deriveSbaPrice({ program: '504', grossApproval: 800_000, thirdPartyDollars: null, ratio: 0.85 }),
    ).toBeNull();
  });

  it('defaults the loan-to-price ratio to 0.85', () => {
    expect(SBA_LOAN_TO_PRICE_DEFAULT).toBe(0.85);
  });
});

describe('sbaUpsertKey', () => {
  it('is a deterministic hash of Program, LocationID, BorrName, ApprovalDate and GrossApproval', () => {
    expect(sbaUpsertKey(sevenA)).toBe(sbaUpsertKey({ ...sevenA }));
  });

  it('changes when any keyed field changes', () => {
    expect(sbaUpsertKey(sevenA)).not.toBe(sbaUpsertKey({ ...sevenA, GrossApproval: '$850,001' }));
  });

  it('ignores fields outside the key', () => {
    expect(sbaUpsertKey(sevenA)).toBe(sbaUpsertKey({ ...sevenA, BankName: 'Other Bank' }));
  });
});

describe('mapSbaRow', () => {
  it('maps a 7(a) row to external loan-proxy comp facts with derived price', () => {
    const facts = mapSbaRow(sevenA, { ratio: 0.85 });
    expect(facts).not.toBeNull();
    expect(facts).toMatchObject({
      program: '7a',
      source: 'sba_foia',
      sourceLabel: 'SBA 7(a) FOIA',
      dataClass: 'external',
      priceBasis: 'loan_proxy',
      confidence: 'proxy',
      naicsCode: '541219',
      state: 'TX',
      price: 1_000_000,
      approvalDate: '2024-03-15',
      termMonths: 120,
      lender: 'First National',
      franchiseFlag: false,
    });
    expect(facts!.sourceRef).toBe(sbaUpsertKey(sevenA));
  });

  it('maps a 504 row using GrossApproval + ThirdPartyDollars and the third-party lender', () => {
    const facts = mapSbaRow(fiveOhFour, { ratio: 0.85 });
    expect(facts).toMatchObject({
      program: '504',
      sourceLabel: 'SBA 504 FOIA',
      price: 1_800_000,
      lender: 'Sierra Bank',
      state: 'NV',
    });
  });

  it('drops a 504 row that has no ThirdPartyDollars', () => {
    expect(mapSbaRow({ ...fiveOhFour, ThirdPartyDollars: '' }, { ratio: 0.85 })).toBeNull();
  });

  it('flags a franchise when a franchise name is present', () => {
    const facts = mapSbaRow({ ...sevenA, FranchiseName: 'Padgett' }, { ratio: 0.85 });
    expect(facts!.franchiseFlag).toBe(true);
  });
});

describe('mapSbaRows', () => {
  it('filters to the tenant NAICS union and drops the rest', () => {
    const rows = mapSbaRows([sevenA, fiveOhFour], { naicsCodes: ['541211'], ratio: 0.85 });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.naicsCode).toBe('541211');
  });

  it('produces no comps when the NAICS union is empty', () => {
    expect(mapSbaRows([sevenA, fiveOhFour], { naicsCodes: [], ratio: 0.85 })).toHaveLength(0);
  });
});

describe('unionNaics', () => {
  it('unions and de-duplicates NAICS codes across deal boxes', () => {
    expect(
      unionNaics([{ naics: ['541211', '541219'] }, { naics: ['541211'] }, {}]).sort(),
    ).toEqual(['541211', '541219']);
  });
});
