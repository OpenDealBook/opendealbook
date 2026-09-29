import { describe, expect, it } from 'vitest';
import bizcomps from './bizcomps-v1.json';
import dealstats from './dealstats-v1.json';
import peercomps from './peercomps-v1.json';
import { loadColumnMap, mapRow, parseField, type ColumnMap } from './column-map';

describe('loadColumnMap', () => {
  it('loads each drafted vendor map and preserves verified flags', () => {
    for (const raw of [dealstats, bizcomps, peercomps]) {
      const map = loadColumnMap(raw);
      expect(map.columns.length).toBeGreaterThan(0);
    }
    const ds = loadColumnMap(dealstats);
    expect(ds.vendor).toBe('DealStats');
    const employees = ds.columns.find((c) => c.target_comp_column === 'employees');
    expect(employees?.verified).toBe(false);
    const naics = ds.columns.find((c) => c.target_comp_column === 'naics');
    expect(naics?.verified).toBe(true);
  });

  it('throws when columns are missing', () => {
    expect(() => loadColumnMap({ vendor: 'X', version: 'v1' })).toThrow();
  });

  it('throws on an unknown parser kind', () => {
    expect(() =>
      loadColumnMap({
        vendor: 'X',
        version: 'v1',
        columns: [
          { vendor_column: 'A', target_comp_column: 'a', parser: 'bogus', required: false, verified: true },
        ],
      }),
    ).toThrow();
  });
});

describe('parseField', () => {
  it('returns null for an empty cell', () => {
    expect(parseField('currency', '')).toBeNull();
    expect(parseField('string', '   ')).toBeNull();
  });

  it('parses currency, stripping symbols and reading parentheses as negative', () => {
    expect(parseField('currency', '$1,200,000')).toBe(1_200_000);
    expect(parseField('currency', '(1,200)')).toBe(-1_200);
  });

  it('throws on non-numeric currency', () => {
    expect(() => parseField('currency', 'abc')).toThrow();
  });

  it('parses percent, stripping a trailing percent sign', () => {
    expect(parseField('percent', '12.5%')).toBe(12.5);
    expect(parseField('percent', '40')).toBe(40);
  });

  it('parses integer and number', () => {
    expect(parseField('integer', '12')).toBe(12);
    expect(parseField('number', '1.96')).toBe(1.96);
  });

  it('normalizes dates to ISO', () => {
    expect(parseField('date', '2024-03-15')).toBe('2024-03-15');
    expect(parseField('date', '3/15/2024')).toBe('2024-03-15');
  });

  it('throws on an unrecognized date', () => {
    expect(() => parseField('date', 'March 2024')).toThrow();
  });

  it('trims strings', () => {
    expect(parseField('string', '  Bookkeeping  ')).toBe('Bookkeeping');
  });

  it('accepts an enum value in the allowed set and rejects others', () => {
    expect(parseField('enum', 'Asset', ['Asset', 'Stock'])).toBe('Asset');
    expect(() => parseField('enum', 'Foo', ['Asset', 'Stock'])).toThrow();
  });
});

describe('mapRow', () => {
  const map: ColumnMap = {
    vendor: 'Test',
    version: 'v1',
    columns: [
      { vendor_column: 'NAICS', target_comp_column: 'naics', parser: 'string', required: true, verified: true },
      { vendor_column: 'Sale Price', target_comp_column: 'sale_price', parser: 'currency', required: true, verified: true },
      { vendor_column: 'Days', target_comp_column: 'days_on_market', parser: 'integer', required: false, verified: true },
    ],
  };

  it('maps vendor columns to target columns through their parsers', () => {
    expect(
      mapRow(map, { NAICS: '541211', 'Sale Price': '$1,000,000', Days: '30' }),
    ).toEqual({ naics: '541211', sale_price: 1_000_000, days_on_market: 30 });
  });

  it('throws when a required column is missing or empty', () => {
    expect(() => mapRow(map, { NAICS: '541211', 'Sale Price': '' })).toThrow();
  });
});
