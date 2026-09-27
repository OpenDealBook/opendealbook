import { describe, expect, it } from 'vitest';

import { parseFirmCsv } from './parse';
import type { FirmFieldMapping } from './types';

const mapping: FirmFieldMapping = {
  name: 'Company',
  website: 'Site',
  established_year: 'Founded',
  owner_age_estimate: 'Owner Age',
  phone: 'Phone',
};

describe('parseFirmCsv', () => {
  it('maps CSV columns to normalized firm fields', () => {
    const csv = 'Company,Site,Founded\nAcme HVAC,acme.com,1998';

    const [row] = parseFirmCsv(csv, mapping);

    expect(row).toMatchObject({
      name: 'Acme HVAC',
      website: 'acme.com',
      established_year: 1998,
    });
  });

  it('trims whitespace and treats blank cells as null', () => {
    const csv = 'Company,Site,Founded\n  Acme  ,,';

    const [row] = parseFirmCsv(csv, mapping);

    expect(row?.name).toBe('Acme');
    expect(row?.website).toBeNull();
    expect(row?.established_year).toBeNull();
  });

  it('returns null for non-numeric integer cells', () => {
    const csv = 'Company,Owner Age\nAcme,retiring soon';

    const [row] = parseFirmCsv(csv, mapping);

    expect(row?.owner_age_estimate).toBeNull();
  });

  it('produces one row per data record', () => {
    const csv = 'Company,Site\nAcme,acme.com\nBeta,beta.com';

    expect(parseFirmCsv(csv, mapping)).toHaveLength(2);
  });
});
