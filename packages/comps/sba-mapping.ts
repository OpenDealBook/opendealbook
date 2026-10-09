import { createHash } from 'crypto';

import { deriveSbaPrice, type SbaCompFacts, type SbaProgram } from './sba';
import { parseField } from './vendors/column-map';

const UPSERT_KEY_FIELDS = ['Program', 'LocationID', 'BorrName', 'ApprovalDate', 'GrossApproval'];

export function sbaUpsertKey(row: Record<string, string>): string {
  const material = UPSERT_KEY_FIELDS.map((field) => (row[field] ?? '').trim()).join('|');
  return createHash('sha256').update(material).digest('hex');
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
    sourceLabel: program === '504' ? 'SBA 504 FOIA' : 'SBA 7(a) FOIA',
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
