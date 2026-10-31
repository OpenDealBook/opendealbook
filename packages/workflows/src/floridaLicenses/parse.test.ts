import { createReadStream } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { FLORIDA_FILES, floridaLicenses } from './parse';

async function parsed(file: (typeof FLORIDA_FILES)[number]) {
  const licenses = [];
  for await (const license of floridaLicenses(file, createReadStream(new URL(`./fixtures/${file}`, import.meta.url)))) {
    licenses.push(license);
  }
  return licenses;
}

describe('floridaLicenses', () => {
  it('ingests the construction, cosmetology and real estate files', () => {
    expect(FLORIDA_FILES).toEqual([
      'CONSTRUCTIONLICENSE_1.csv',
      'COSMETOLOGYLICENSE_1.csv',
      'REALESTATE2501LICENSE_1.csv',
    ]);
  });

  it('keeps each construction license held under a business name, by that name, and a qualified business also by its licensee name, with its status in words, skipping blank lines and leaving a date it cannot read empty', async () => {
    expect(await parsed('CONSTRUCTIONLICENSE_1.csv')).toEqual([
      {
        file: 'CONSTRUCTIONLICENSE_1.csv',
        licensee_name: 'HARBOR FIXTURE DENTAL, LLC',
        normalized_names: ['harbor fixture dental'],
        license_number: 'TESTCBC0001',
        license_type: 'CBC',
        status: 'Active',
        expires_on: '2028-08-31',
        raw: expect.arrayContaining(['SAMPLE, AVERY', 'HARBOR FIXTURE DENTAL, LLC', 'A']),
      },
      {
        file: 'CONSTRUCTIONLICENSE_1.csv',
        licensee_name: "MARSH & O'NEIL BUILDERS INC",
        normalized_names: ['marsh and oneil builders'],
        license_number: 'TESTCGC0003',
        license_type: 'CGC',
        status: null,
        expires_on: null,
        raw: expect.any(Array),
      },
      expect.objectContaining({
        licensee_name: 'HARBOUR HOLDINGS INC.',
        normalized_names: ['harbour holdings', 'harbor fixture air'],
        license_number: null,
        license_type: 'QB',
      }),
      expect.objectContaining({
        licensee_name: 'HARBOR FIXTURE MECHANICAL INC.',
        normalized_names: ['harbor fixture mechanical'],
        license_type: 'QB',
      }),
      expect.objectContaining({ licensee_name: 'HARBOR FIXTURE GLASS', expires_on: null, raw: expect.arrayContaining(['13/45/2028']) }),
    ]);
  });

  it('reads cosmetology licenses in the same layout, keeping a status it does not know only in raw', async () => {
    expect(await parsed('COSMETOLOGYLICENSE_1.csv')).toEqual([
      expect.objectContaining({
        licensee_name: 'HARBOR FIXTURE SALON',
        license_number: 'TESTCE0006',
        license_type: 'CE',
        status: 'Active',
        expires_on: '2027-10-31',
      }),
      expect.objectContaining({
        licensee_name: 'HARBOR FIXTURE NAILS',
        status: null,
        raw: expect.arrayContaining(['P']),
      }),
    ]);
  });

  it("reads every real estate license by its licensee and DBA names, never by the employing brokerage's name, even where the file leaves quotes inside a field unescaped, reading a two-digit year more than 50 years ahead as last century", async () => {
    expect(await parsed('REALESTATE2501LICENSE_1.csv')).toEqual([
      {
        file: 'REALESTATE2501LICENSE_1.csv',
        licensee_name: 'EXAMPLE, PAT',
        normalized_names: ['example pat', 'harbor fixture realty'],
        license_number: 'TESTBK0008',
        license_type: 'BK Broker',
        status: 'Active',
        expires_on: '2027-09-30',
        raw: expect.arrayContaining(['HARBOR FIXTURE REALTY']),
      },
      expect.objectContaining({
        licensee_name: 'SAMPLE, SAM',
        normalized_names: ['sample sam'],
        license_number: 'TESTSL0009',
        status: 'Inactive',
      }),
      expect.objectContaining({
        licensee_name: 'PLACEHOLDER, DANA "DEE"',
        normalized_names: ['placeholder dana dee', 'harbor fixture realty'],
        license_number: 'TESTBK0010',
        license_type: 'BK Broker',
        status: 'Active',
        expires_on: '2027-09-30',
      }),
      expect.objectContaining({ license_number: 'TESTBK0011', expires_on: '1999-03-31' }),
      expect.objectContaining({ license_number: 'TESTBK0012', expires_on: null, raw: expect.arrayContaining(['31-FOO-27']) }),
    ]);
  });
});
