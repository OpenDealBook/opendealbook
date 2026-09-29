import { createHash } from 'node:crypto';

import { parseField } from './vendors/column-map';

export const SBA_LOAN_TO_PRICE_DEFAULT = 0.85;

export type SbaProgram = '7a' | '504';

export interface SbaCompFacts {
  program: SbaProgram;
  source: 'sba_foia';
  sourceRef: string;
  dataClass: 'external';
  priceBasis: 'loan_proxy';
  confidence: 'proxy';
  naicsCode: string;
  naicsDescription: string | null;
  city: string | null;
  state: string | null;
  price: number;
  approvalDate: string;
  termMonths: number | null;
  businessAge: string | null;
  lender: string | null;
  franchiseFlag: boolean;
}

const UPSERT_KEY_FIELDS = ['Program', 'LocationID', 'BorrName', 'ApprovalDate', 'GrossApproval'];

export function sbaUpsertKey(row: Record<string, string>): string {
  const material = UPSERT_KEY_FIELDS.map((field) => (row[field] ?? '').trim()).join('|');
  return createHash('sha256').update(material).digest('hex');
}

export function deriveSbaPrice(input: {
  program: SbaProgram;
  grossApproval: number;
  thirdPartyDollars: number | null;
  ratio: number;
}): number | null {
  if (input.program === '7a') {
    return input.grossApproval / input.ratio;
  }
  if (input.thirdPartyDollars === null) {
    return null;
  }
  return input.grossApproval + input.thirdPartyDollars;
}

function programOf(row: Record<string, string>): SbaProgram {
  return (row.Program ?? '').includes('504') ? '504' : '7a';
}

function text(row: Record<string, string>, field: string): string | null {
  const value = (row[field] ?? '').trim();
  return value === '' ? null : value;
}

function currency(row: Record<string, string>, field: string): number | null {
  const value = parseField('currency', row[field] ?? '');
  return typeof value === 'number' ? value : null;
}

export function mapSbaRow(
  row: Record<string, string>,
  options: { ratio: number },
): SbaCompFacts | null {
  const naicsCode = text(row, 'NaicsCode');
  if (naicsCode === null) {
    return null;
  }

  const grossApproval = currency(row, 'GrossApproval');
  if (grossApproval === null) {
    return null;
  }

  const program = programOf(row);
  const price = deriveSbaPrice({
    program,
    grossApproval,
    thirdPartyDollars: currency(row, 'ThirdPartyDollars'),
    ratio: options.ratio,
  });
  if (price === null) {
    return null;
  }

  const termMonths = parseField('integer', row.TermInMonths ?? '');
  const lender =
    program === '504'
      ? text(row, 'ThirdPartyLender_Name') ?? text(row, 'CDC_Name')
      : text(row, 'BankName');

  return {
    program,
    source: 'sba_foia',
    sourceRef: sbaUpsertKey(row),
    dataClass: 'external',
    priceBasis: 'loan_proxy',
    confidence: 'proxy',
    naicsCode,
    naicsDescription: text(row, 'NaicsDescription'),
    city: text(row, 'BorrCity'),
    state: text(row, 'BorrState'),
    price,
    approvalDate: parseField('date', row.ApprovalDate ?? '') as string,
    termMonths: typeof termMonths === 'number' ? termMonths : null,
    businessAge: text(row, 'BusinessAge'),
    lender,
    franchiseFlag: text(row, 'FranchiseName') !== null || text(row, 'FranchiseCode') !== null,
  };
}

export function mapSbaRows(
  rows: Record<string, string>[],
  options: { naicsCodes: string[]; ratio: number },
): SbaCompFacts[] {
  const allowed = new Set(options.naicsCodes);
  const facts: SbaCompFacts[] = [];
  for (const row of rows) {
    if (!allowed.has((row.NaicsCode ?? '').trim())) {
      continue;
    }
    const mapped = mapSbaRow(row, { ratio: options.ratio });
    if (mapped) {
      facts.push(mapped);
    }
  }
  return facts;
}

export function unionNaics(criteria: { naics?: string[] | null }[]): string[] {
  const codes = new Set<string>();
  for (const entry of criteria) {
    for (const code of entry.naics ?? []) {
      codes.add(code.trim());
    }
  }
  return [...codes];
}
