import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { utils, write, type WorkBook, type WorkSheet } from 'xlsx';

import { sheetBlocks } from './sheets';

function workbook(
  sheets: Record<string, WorkSheet>,
  hidden: string[] = [],
): Uint8Array {
  const book: WorkBook = utils.book_new();
  for (const [name, sheet] of Object.entries(sheets)) {
    utils.book_append_sheet(book, sheet, name);
  }
  book.Workbook = {
    Sheets: Object.keys(sheets).map((name) => ({
      name,
      Hidden: hidden.includes(name) ? 1 : 0,
    })),
  };
  return new Uint8Array(
    write(book, { type: 'array', bookType: 'xlsx', cellStyles: true }),
  );
}

function rows(count: number, from = 2): string[][] {
  return Array.from({ length: count }, (_, i) => [`Item ${from + i}`, 'x']);
}

describe('sheetBlocks', () => {
  it('renders the header and each row with column letters, displayed values and only non-empty cells', () => {
    const sheet = utils.aoa_to_sheet([
      ['Line item', '', 'FY2025'],
      ['Revenue', '', 1234567],
    ]);
    sheet['C2']!.z = '"$"#,##0';

    expect(sheetBlocks(workbook({ 'P&L': sheet }), 'xlsx')).toEqual([
      {
        kind: 'sheet_block',
        sheet: 'P&L',
        cell_range: 'A2:C2',
        text: '1 | A: Line item | C: FY2025\n2 | A: Revenue | C: $1,234,567',
        formulas: null,
      },
    ]);
  });

  it('takes the first non-empty row as the header and repeats it atop every block of the sheet', () => {
    const sheet = utils.aoa_to_sheet([
      [],
      [],
      ['Name', 'Flag'],
      ...rows(150, 4),
    ]);

    const blocks = sheetBlocks(workbook({ Data: sheet }), 'xlsx');

    expect(blocks.map((b) => b.cell_range)).toEqual(['A4:B103', 'A104:B153']);
    for (const block of blocks) {
      expect(block.text.split('\n')[0]).toBe('3 | A: Name | B: Flag');
    }
    expect(blocks[0]!.text.split('\n')[1]).toBe('4 | A: Item 4 | B: x');
    expect(blocks[1]!.text.split('\n')).toHaveLength(51);
  });

  it('closes a block at about 4,000 characters', () => {
    const long = 'y'.repeat(900);
    const sheet = utils.aoa_to_sheet([
      ['Note'],
      ...Array.from({ length: 10 }, () => [long]),
    ]);

    const blocks = sheetBlocks(workbook({ Notes: sheet }), 'xlsx');

    expect(blocks.map((b) => b.cell_range)).toEqual([
      'A2:A5',
      'A6:A9',
      'A10:A11',
    ]);
    for (const block of blocks) {
      expect(block.text.length).toBeLessThanOrEqual(4000);
    }
  });

  it('splits very wide rows into column bands, each with its header slice', () => {
    const wide = 'w'.repeat(700);
    const sheet = utils.aoa_to_sheet([
      ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'],
      [wide, wide, wide, wide, wide, wide],
      [wide, wide, wide, wide, wide, wide],
    ]);

    const blocks = sheetBlocks(workbook({ Wide: sheet }), 'xlsx');

    expect(blocks.map((b) => b.cell_range)).toEqual([
      'A2:B3',
      'C2:D3',
      'E2:F3',
    ]);
    expect(blocks.map((b) => b.text.split('\n')[0])).toEqual([
      '1 | A: H1 | B: H2',
      '1 | C: H3 | D: H4',
      '1 | E: H5 | F: H6',
    ]);
  });

  it('shows errors and dates as Excel displays them', () => {
    const sheet = utils.aoa_to_sheet([['Metric', 'Value']]);
    sheet['A2'] = { t: 's', v: 'Margin' };
    sheet['B2'] = { t: 'e', v: 0x07 };
    sheet['A3'] = { t: 's', v: 'Closed' };
    sheet['B3'] = { t: 'n', v: 45000, z: 'm/d/yy' };
    sheet['!ref'] = 'A1:B3';

    expect(sheetBlocks(workbook({ S: sheet }), 'xlsx')[0]!.text).toBe(
      '1 | A: Metric | B: Value\n2 | A: Margin | B: #DIV/0!\n3 | A: Closed | B: 3/15/23',
    );
  });

  it('shows a merged cell once at its anchor, tagged with its extent', () => {
    const sheet = utils.aoa_to_sheet([
      ['Segment', 'Q1', 'Q2', 'Q3'],
      ['Totals across all segments'],
    ]);
    sheet['!merges'] = [utils.decode_range('A2:D2')];

    expect(sheetBlocks(workbook({ S: sheet }), 'xlsx')[0]!.text).toBe(
      '1 | A: Segment | B: Q1 | C: Q2 | D: Q3\n2 | A: Totals across all segments (merged A2:D2)',
    );
  });

  it('keeps formulas apart from the text, in the same row format, and null for a block without them', () => {
    const sheet = utils.aoa_to_sheet([
      ['Line', 'Amount'],
      ['A', 2],
      ['B', 3],
    ]);
    sheet['A4'] = { t: 's', v: 'Total' };
    sheet['B4'] = { t: 'n', v: 5, f: 'SUM(B2:B3)' };
    sheet['!ref'] = 'A1:B4';
    const plain = utils.aoa_to_sheet([['Line'], ['A']]);

    const [withFormula, without] = sheetBlocks(
      workbook({ Model: sheet, Plain: plain }),
      'xlsx',
    );

    expect(withFormula!.text).toBe(
      '1 | A: Line | B: Amount\n2 | A: A | B: 2\n3 | A: B | B: 3\n4 | A: Total | B: 5',
    );
    expect(withFormula!.formulas).toBe('4 | B: =SUM(B2:B3)');
    expect(without!.formulas).toBeNull();
  });

  it('keeps a formula cell with no cached value, empty in the text and whole in the formulas', () => {
    const sheet = utils.aoa_to_sheet([
      ['Line', 'Amount'],
      ['A', 2],
    ]);
    sheet['B3'] = { t: 'n', f: 'B2*2' };
    sheet['!ref'] = 'A1:B3';

    const [block] = sheetBlocks(workbook({ Model: sheet }), 'xlsx');

    expect(block!.text).toBe(
      '1 | A: Line | B: Amount\n2 | A: A | B: 2\n3 | B: ',
    );
    expect(block!.formulas).toBe('3 | B: =B2*2');
    expect(block!.cell_range).toBe('A2:B3');
  });

  it('includes hidden sheets, rows and columns, tagged hidden', () => {
    const sheet = utils.aoa_to_sheet([
      ['Name', 'Secret', 'Shown'],
      ['Alpha', 'a1', 'a2'],
      ['Beta', 'b1', 'b2'],
    ]);
    sheet['!rows'] = [{}, {}, { hidden: true }];
    sheet['!cols'] = [{}, { hidden: true }];
    const backup = utils.aoa_to_sheet([['Old'], ['value']]);

    const blocks = sheetBlocks(
      workbook({ Visible: sheet, Backup: backup }, ['Backup']),
      'xlsx',
    );

    expect(blocks.map((b) => [b.sheet, b.text])).toEqual([
      [
        'Visible',
        '1 | A: Name | B (hidden): Secret | C: Shown\n2 | A: Alpha | B (hidden): a1 | C: a2\n3 (hidden) | A: Beta | B (hidden): b1 | C: b2',
      ],
      ['Backup', '(hidden sheet)\n1 | A: Old\n2 | A: value'],
    ]);
  });

  it('indexes every sheet in workbook order and nothing for an empty sheet', () => {
    const blocks = sheetBlocks(
      workbook({
        First: utils.aoa_to_sheet([['A'], ['1']]),
        Empty: utils.aoa_to_sheet([]),
        Last: utils.aoa_to_sheet([['B'], ['2']]),
      }),
      'xlsx',
    );

    expect(blocks.map((b) => b.sheet)).toEqual(['First', 'Last']);
  });

  it('indexes a sheet holding only a header as a header-only block', () => {
    expect(
      sheetBlocks(
        workbook({ Labels: utils.aoa_to_sheet([[], ['Name', 'Amount']]) }),
        'xlsx',
      ),
    ).toEqual([
      {
        kind: 'sheet_block',
        sheet: 'Labels',
        cell_range: 'A2:B2',
        text: '2 | A: Name | B: Amount',
        formulas: null,
      },
    ]);
  });

  it('reads CSV cells as literal text', () => {
    const csv = 'Code,Opened,Calc\n001,1/2/2024,=1+1\n"Smith, J",0.50,TRUE\n';

    expect(sheetBlocks(new TextEncoder().encode(csv), 'csv')).toEqual([
      {
        kind: 'sheet_block',
        sheet: 'Sheet1',
        cell_range: 'A2:C3',
        text: '1 | A: Code | B: Opened | C: Calc\n2 | A: 001 | B: 1/2/2024 | C: =1+1\n3 | A: Smith, J | B: 0.50 | C: TRUE',
        formulas: null,
      },
    ]);
  });

  it('refuses a workbook that inflates beyond the archive guard', () => {
    const bomb = zipSync(
      { 'xl/bomb.bin': new Uint8Array(201 * 1024 * 1024) },
      { level: 9 },
    );

    expect(() => sheetBlocks(bomb, 'xlsx')).toThrow(/inflates beyond/);
  }, 30_000);
});
