import { describe, expect, it } from 'vitest';

import { csvRecords, firstZipEntry } from './csv';
import { RecordReader, RejectedRow } from './recordReader';
import { parseForm5500, parseForm5500Sf, parsePpp, parseSba } from './sources';

import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';

const fixture = (name: string) =>
  createReadStream(new URL(`./fixtures/${name}`, import.meta.url));

async function parseAll<T>(
  records: AsyncIterable<Record<string, string>>,
  parse: (reader: RecordReader) => T,
) {
  const rows: T[] = [];
  const nulled: string[][] = [];
  const rejected: string[] = [];
  for await (const record of records) {
    const reader = new RecordReader(record);
    try {
      rows.push(parse(reader));
      nulled.push(reader.nulled);
    } catch (error) {
      if (!(error instanceof RejectedRow)) throw error;
      rejected.push(error.message);
    }
  }
  return { rows, nulled, rejected };
}

describe('PPP loan file', () => {
  it('maps each loan and keeps a row whose date is malformed with that date nulled', async () => {
    const { rows, nulled, rejected } = await parseAll(
      csvRecords(fixture('ppp.csv'), []),
      parsePpp,
    );

    expect(rows).toEqual([
      {
        loan_number: '9000000001',
        borrower_name: 'BRIGHTWATER COATINGS, INC.',
        address_line1: '100 Example Road',
        city: 'Sumter',
        state: 'SC',
        postal_code: '29150-9662',
        naics_code: '325510',
        business_age_description: 'Existing or more than 2 years old',
        jobs_reported: 62,
        loan_amount: 769358.78,
        approved_on: '2020-05-01',
      },
      {
        loan_number: '9000000002',
        borrower_name: 'Quiet Pines Landscaping LLC',
        address_line1: null,
        city: null,
        state: null,
        postal_code: null,
        naics_code: null,
        business_age_description: null,
        jobs_reported: null,
        loan_amount: 20000,
        approved_on: '2020-06-15',
      },
      expect.objectContaining({
        loan_number: '9000000003',
        borrower_name: 'Broken Date Bakery',
        approved_on: null,
      }),
    ]);
    expect(nulled).toEqual([[], [], ['DateApproved']]);
    expect(rejected).toEqual([]);
  });
});

describe('SBA 7(a) and 504 files', () => {
  it('keys 7(a) loans by the shared SBA source key and accepts a 5-digit NAICS', async () => {
    const { rows } = await parseAll(
      csvRecords(fixture('sba_7a.csv'), []),
      parseSba('sba_7a'),
    );

    expect(rows[0]).toEqual({
      source_key: expect.stringMatching(/^[0-9a-f]{64}$/),
      program: 'sba_7a',
      borrower_name: 'Hollow Creek Construction, Inc.',
      address_line1: '1403 Sample Lane',
      city: 'Norristown',
      state: 'PA',
      postal_code: '19403',
      naics_code: '236220',
      jobs_supported: 5,
      loan_amount: 25000,
      approved_on: '2019-10-01',
    });
    expect(rows[0]!.source_key).toBe(rows[1]!.source_key);
    expect(rows[2]).toMatchObject({
      naics_code: '72251',
      jobs_supported: null,
    });
  });

  it('keeps a 504 loan whose NAICS code is longer than 6 digits with the code nulled', async () => {
    const { rows, nulled, rejected } = await parseAll(
      csvRecords(fixture('sba_504.csv'), []),
      parseSba('sba_504'),
    );

    expect(rows).toEqual([
      expect.objectContaining({
        program: 'sba_504',
        borrower_name: 'Birchline Care Homes',
        jobs_supported: 14,
        loan_amount: 1248000,
      }),
      expect.objectContaining({
        borrower_name: 'Bad Naics Car Wash, LLC',
        naics_code: null,
      }),
    ]);
    expect(nulled).toEqual([[], ['NaicsCode']]);
    expect(rejected).toEqual([]);
  });
});

describe('Form 5500 files', () => {
  it('maps a 5500 filing and rejects an EIN that is not 9 digits', async () => {
    const { rows, rejected } = await parseAll(
      csvRecords(fixture('form_5500.csv'), []),
      parseForm5500,
    );

    expect(rows).toEqual([
      {
        ack_id: '20260225154215NAL0000000001001',
        ein: '261640968',
        sponsor_name: 'RIVERBEND MAIL CORP.',
        address_line1: '610 SAMPLE STREET',
        city: 'FOLSOM',
        state: 'CA',
        postal_code: '95630',
        participant_count: 41,
        plan_year_begin: '2025-01-01',
      },
    ]);
    expect(rejected).toEqual(['SPONS_DFE_EIN: 88038617']);
  });

  it('reads a 5500-SF filing out of the zipped bulk file', async () => {
    const { rows } = await parseAll(
      csvRecords(firstZipEntry(fixture('form_5500_sf.zip')), []),
      parseForm5500Sf,
    );

    expect(rows).toEqual([
      {
        ack_id: '20260225153554NAL0000000003001',
        ein: '060834774',
        sponsor_name: 'FERNHILL INSURANCE AGENCY, INC.',
        address_line1: 'P. O. BOX 160',
        city: 'TAFTVILLE',
        state: 'CT',
        postal_code: '06380',
        participant_count: 4,
        plan_year_begin: '2025-01-01',
      },
    ]);
  });

  it('decodes a Windows-1252 file and a UTF-8 file to the same sponsor name', async () => {
    const windows = await parseAll(
      csvRecords(fixture('form_5500_cp1252.csv'), []),
      parseForm5500,
    );
    const utf8 = await parseAll(
      csvRecords(fixture('form_5500_utf8.csv'), []),
      parseForm5500,
    );

    expect(windows.rows[0]?.sponsor_name).toBe(
      'CAF\u00c9 ROSEMARY \u2013 BISTRO LLC',
    );
    expect(utf8.rows[0]?.sponsor_name).toBe(
      'CAF\u00c9 ROSEMARY \u2013 BISTRO LLC',
    );
  });

  it('decodes a Windows-1252 byte that arrives after UTF-8 looking chunks', async () => {
    const ascii =
      'ACK_ID,SF_SPONS_EIN,SF_SPONSOR_NAME\n' +
      'A1,060834774,PLAIN NAME\n'.repeat(2000);
    const late = Buffer.concat([
      Buffer.from(ascii),
      Buffer.from('A2,060834775,CAF'),
      Buffer.from([0xc9]),
      Buffer.from(' LATE\n'),
    ]);
    const chunks = [
      late.subarray(0, 16384),
      late.subarray(16384, 40000),
      late.subarray(40000),
    ];

    const { rows } = await parseAll(
      csvRecords(Readable.from(chunks), []),
      parseForm5500Sf,
    );

    expect(rows.at(-1)?.sponsor_name).toBe('CAF\u00c9 LATE');
    expect(rows).toHaveLength(2001);
  });
});
