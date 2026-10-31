import { createInterface } from 'node:readline';
import type { Readable } from 'node:stream';

import { normalizeName } from '../leadMatch/matcher';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function isoDay(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.toISOString().slice(0, 10) : null;
}

function monthFirstDay(written: string): string | null {
  const parts = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(written);
  return parts ? isoDay(Number(parts[3]), Number(parts[1]), Number(parts[2])) : null;
}

const CENTURY_PIVOT_YEARS = 50;

function dayMonthDay(written: string): string | null {
  const parts = /^(\d{2})-([A-Z]{3})-(\d{2})$/.exec(written);
  const month = MONTHS.indexOf(parts?.[2] ?? '') + 1;
  if (!parts || month === 0) {
    return null;
  }
  const thisCentury = 2000 + Number(parts[3]);
  const year = thisCentury > new Date().getUTCFullYear() + CENTURY_PIVOT_YEARS ? thisCentury - 100 : thisCentury;
  return isoDay(year, month, Number(parts[1]));
}

const STATUSES = new Map<string, 'Active' | 'Inactive'>([
  ['A', 'Active'],
  ['Active', 'Active'],
  ['I', 'Inactive'],
  ['Inactive', 'Inactive'],
]);

const BOARD_LAYOUT = {
  names: (row: string[]) => (row[1] === 'QB' ? [2, 3] : [3]),
  type: 1,
  number: 20,
  status: 14,
  expires: 17,
  day: monthFirstDay,
};

const LAYOUTS = {
  'CONSTRUCTIONLICENSE_1.csv': BOARD_LAYOUT,
  'COSMETOLOGYLICENSE_1.csv': BOARD_LAYOUT,
  'REALESTATE2501LICENSE_1.csv': { names: () => [1, 2], type: 3, number: 17, status: 13, expires: 16, day: dayMonthDay },
};

export type FloridaFile = keyof typeof LAYOUTS;

export const FLORIDA_FILES = Object.keys(LAYOUTS) as FloridaFile[];

export interface FloridaLicense {
  file: FloridaFile;
  licensee_name: string;
  normalized_names: string[];
  license_number: string | null;
  license_type: string;
  status: 'Active' | 'Inactive' | null;
  expires_on: string | null;
  raw: string[];
}

export async function* floridaLicenses(file: FloridaFile, csv: Readable): AsyncGenerator<FloridaLicense> {
  const layout = LAYOUTS[file];
  for await (const line of createInterface({ input: csv, crlfDelay: Infinity })) {
    if (line === '') {
      continue;
    }
    const row = line.slice(1, -1).split('","');
    const names = layout
      .names(row)
      .map((column) => row[column]!.trim())
      .filter((name) => name !== '');
    if (names.length === 0) {
      continue;
    }
    yield {
      file,
      licensee_name: names[0]!,
      normalized_names: [...new Set(names.map(normalizeName))],
      license_number: row[layout.number] || null,
      license_type: row[layout.type]!,
      status: STATUSES.get(row[layout.status]!) ?? null,
      expires_on: layout.day(row[layout.expires]!),
      raw: row,
    };
  }
}
