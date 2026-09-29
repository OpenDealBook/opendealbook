export type ParserKind =
  | 'string'
  | 'integer'
  | 'number'
  | 'currency'
  | 'percent'
  | 'date'
  | 'enum';

const PARSER_KINDS: readonly ParserKind[] = [
  'string',
  'integer',
  'number',
  'currency',
  'percent',
  'date',
  'enum',
];

export interface ColumnSpec {
  vendor_column: string;
  target_comp_column: string;
  parser: ParserKind;
  required: boolean;
  verified: boolean;
  enum_values?: string[];
}

export interface ColumnMap {
  vendor: string;
  version: string;
  columns: ColumnSpec[];
}

export type ParsedValue = string | number | null;

function isParserKind(value: unknown): value is ParserKind {
  return PARSER_KINDS.includes(value as ParserKind);
}

export function loadColumnMap(raw: unknown): ColumnMap {
  const map = raw as Partial<ColumnMap>;
  if (typeof map.vendor !== 'string' || typeof map.version !== 'string') {
    throw new Error('Column map is missing vendor or version');
  }
  if (!Array.isArray(map.columns) || map.columns.length === 0) {
    throw new Error(`Column map ${map.vendor} has no columns`);
  }
  for (const column of map.columns) {
    if (!isParserKind(column.parser)) {
      throw new Error(`Column ${column.target_comp_column} has unknown parser ${column.parser}`);
    }
  }
  return { vendor: map.vendor, version: map.version, columns: map.columns };
}

function parseCurrency(raw: string): number {
  const negative = /^\(.*\)$/.test(raw);
  const digits = raw.replace(/[^0-9.]/g, '');
  if (digits === '') {
    throw new Error(`Invalid currency: ${raw}`);
  }
  const value = Number(digits);
  return negative ? -value : value;
}

function parsePercent(raw: string): number {
  const value = Number(raw.replace(/%$/, '').replace(/,/g, ''));
  if (Number.isNaN(value)) {
    throw new Error(`Invalid percent: ${raw}`);
  }
  return value;
}

function parseDate(raw: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }
  const parts = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (parts) {
    const [, month, day, year] = parts;
    return `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`;
  }
  throw new Error(`Unrecognized date: ${raw}`);
}

function parseNumber(raw: string): number {
  const value = Number(raw.replace(/,/g, ''));
  if (Number.isNaN(value)) {
    throw new Error(`Invalid number: ${raw}`);
  }
  return value;
}

function parseEnum(raw: string, enumValues?: string[]): string {
  if (!enumValues || !enumValues.includes(raw)) {
    throw new Error(`Value ${raw} is not in the allowed set`);
  }
  return raw;
}

export function parseField(
  kind: ParserKind,
  raw: string,
  enumValues?: string[],
): ParsedValue {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return null;
  }
  switch (kind) {
    case 'string':
      return trimmed;
    case 'integer':
      return Math.trunc(parseNumber(trimmed));
    case 'number':
      return parseNumber(trimmed);
    case 'currency':
      return parseCurrency(trimmed);
    case 'percent':
      return parsePercent(trimmed);
    case 'date':
      return parseDate(trimmed);
    case 'enum':
      return parseEnum(trimmed, enumValues);
  }
}

export function mapRow(
  map: ColumnMap,
  row: Record<string, string>,
): Record<string, ParsedValue> {
  const mapped: Record<string, ParsedValue> = {};
  for (const column of map.columns) {
    const value = parseField(column.parser, row[column.vendor_column] ?? '', column.enum_values);
    if (column.required && value === null) {
      throw new Error(`Required column ${column.vendor_column} is missing`);
    }
    mapped[column.target_comp_column] = value;
  }
  return mapped;
}
