import { read, utils, type WorkBook, type WorkSheet } from 'xlsx';

import { inflatesBeyond, MAX_INFLATED_BYTES } from '@odb/shared/archive';

const BLOCK_CHARS = 4000;
const BLOCK_ROWS = 100;
const BAND_CHARS = BLOCK_CHARS / 2;

export type SpreadsheetFormat = 'xlsx' | 'xls' | 'csv';

export interface SheetBlock {
  kind: 'sheet_block';
  sheet: string;
  cell_range: string;
  text: string;
  formulas: string | null;
}

interface Cell {
  column: number;
  label: string;
  value: string;
  formula: string | null;
}

interface Row {
  index: number;
  label: string;
  cells: Cell[];
}

export function sheetBlocks(
  bytes: Uint8Array,
  format: SpreadsheetFormat,
): SheetBlock[] {
  const workbook =
    format === 'csv'
      ? read(new TextDecoder().decode(bytes), { type: 'string', raw: true })
      : readWorkbook(bytes);
  return workbook.SheetNames.flatMap((name, position) =>
    blocksOf(
      name,
      workbook.Sheets[name]!,
      Boolean(workbook.Workbook?.Sheets?.[position]?.Hidden),
    ),
  );
}

function readWorkbook(bytes: Uint8Array): WorkBook {
  if (inflatesBeyond(bytes, MAX_INFLATED_BYTES)) {
    throw new Error(`workbook inflates beyond ${MAX_INFLATED_BYTES} bytes`);
  }
  return read(bytes, { type: 'array', cellStyles: true });
}

function blocksOf(
  name: string,
  sheet: WorkSheet,
  hidden: boolean,
): SheetBlock[] {
  const [header, ...data] = rowsOf(sheet);
  if (!header) {
    return [];
  }
  const preamble = hidden ? ['(hidden sheet)'] : [];
  if (data.length === 0) {
    return [block(name, preamble, [header])];
  }
  return bandsOf([header, ...data]).flatMap((band) => {
    const headerSlice = slice(header, band);
    const heading = headerSlice ? [...preamble, render(headerSlice)] : preamble;
    const bandRows = data.flatMap((row) => slice(row, band) ?? []);
    return groupRows(bandRows, heading.join('\n').length).map((rows) =>
      block(name, heading, rows),
    );
  });
}

function rowsOf(sheet: WorkSheet): Row[] {
  if (!sheet['!ref']) {
    return [];
  }
  const range = utils.decode_range(sheet['!ref']);
  const merges = new Map<string, string>();
  const covered = new Set<string>();
  for (const merge of sheet['!merges'] ?? []) {
    const extent = utils.encode_range(merge);
    merges.set(utils.encode_cell(merge.s), extent);
    for (let r = merge.s.r; r <= merge.e.r; r++) {
      for (let c = merge.s.c; c <= merge.e.c; c++) {
        if (r !== merge.s.r || c !== merge.s.c) {
          covered.add(utils.encode_cell({ r, c }));
        }
      }
    }
  }

  const rows: Row[] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const cells: Cell[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const address = utils.encode_cell({ r, c });
      const cell = sheet[address];
      const value = cell?.w ?? (cell?.v === undefined ? '' : String(cell.v));
      if ((value === '' && !cell?.f) || covered.has(address)) {
        continue;
      }
      const merge = merges.get(address);
      cells.push({
        column: c,
        label: `${utils.encode_col(c)}${sheet['!cols']?.[c]?.hidden ? ' (hidden)' : ''}`,
        value: merge ? `${value} (merged ${merge})` : value,
        formula: cell.f ? `=${cell.f}` : null,
      });
    }
    if (cells.length > 0) {
      rows.push({
        index: r,
        label: `${r + 1}${sheet['!rows']?.[r]?.hidden ? ' (hidden)' : ''}`,
        cells,
      });
    }
  }
  return rows;
}

function bandsOf(rows: Row[]): Set<number>[] {
  const widths = new Map<number, number>();
  for (const row of rows) {
    for (const cell of row.cells) {
      const width = piece(cell).length + 3;
      widths.set(cell.column, Math.max(widths.get(cell.column) ?? 0, width));
    }
  }
  const bands: Set<number>[] = [];
  let current = new Set<number>();
  let used = 0;
  for (const [column, width] of [...widths].sort(([a], [b]) => a - b)) {
    if (current.size > 0 && used + width > BAND_CHARS) {
      bands.push(current);
      current = new Set();
      used = 0;
    }
    current.add(column);
    used += width;
  }
  bands.push(current);
  return bands;
}

function slice(row: Row, band: Set<number>): Row | null {
  const cells = row.cells.filter((cell) => band.has(cell.column));
  return cells.length > 0 ? { ...row, cells } : null;
}

function groupRows(rows: Row[], headingLength: number): Row[][] {
  const groups: Row[][] = [];
  let current: Row[] = [];
  let length = headingLength;
  for (const row of rows) {
    const line = render(row).length + 1;
    if (
      current.length > 0 &&
      (current.length === BLOCK_ROWS || length + line > BLOCK_CHARS)
    ) {
      groups.push(current);
      current = [];
      length = headingLength;
    }
    current.push(row);
    length += line;
  }
  if (current.length > 0) {
    groups.push(current);
  }
  return groups;
}

function block(name: string, heading: string[], rows: Row[]): SheetBlock {
  const formulaLines = rows.flatMap((row) => {
    const cells = row.cells.filter((cell) => cell.formula);
    return cells.length > 0
      ? [
          `${row.label} | ${cells.map((cell) => `${cell.label}: ${cell.formula}`).join(' | ')}`,
        ]
      : [];
  });
  return {
    kind: 'sheet_block',
    sheet: name,
    cell_range: boundingBox(rows),
    text: [...heading, ...rows.map(render)].join('\n'),
    formulas: formulaLines.length > 0 ? formulaLines.join('\n') : null,
  };
}

function boundingBox(rows: Row[]): string {
  const columns = rows.flatMap((row) => row.cells.map((cell) => cell.column));
  return utils.encode_range({
    s: { r: rows[0]!.index, c: Math.min(...columns) },
    e: { r: rows.at(-1)!.index, c: Math.max(...columns) },
  });
}

function render(row: Row): string {
  return `${row.label} | ${row.cells.map(piece).join(' | ')}`;
}

function piece(cell: Cell): string {
  return `${cell.label}: ${cell.value}`;
}
