import { describe, expect, it, vi } from 'vitest';
import { utils, write } from 'xlsx';

import type { DoclingDocument, DoclingPass } from './docling';
import { extractSegments, ingestibleFormat } from './segments';

function scannedDocument(
  pageCount: number,
  textByPage: Record<number, string>,
): DoclingDocument {
  const texts = Object.entries(textByPage).map(([page, text], index) => ({
    self_ref: `#/texts/${index}`,
    label: 'text',
    text,
    prov: [{ page_no: Number(page) }],
    children: [],
  }));
  return {
    body: {
      self_ref: '#/body',
      label: 'unspecified',
      children: texts.map((text) => ({ $ref: text.self_ref })),
    },
    groups: [],
    tables: [],
    pictures: [],
    texts,
    pages: Object.fromEntries(
      Array.from({ length: pageCount }, (_, index) => [
        String(index + 1),
        { page_no: index + 1 },
      ]),
    ),
  };
}

function fakeDocling(
  textLayer: Record<number, string>,
  ocr: Record<number, string>,
  pageCount: number,
) {
  return vi.fn(
    async (_bytes: Uint8Array, _fileName: string, pass: DoclingPass) => {
      if (pass.ocr === 'none') {
        return scannedDocument(pageCount, textLayer);
      }
      const [from, to] = pass.pages ?? [1, pageCount];
      return scannedDocument(
        pageCount,
        Object.fromEntries(
          Object.entries(ocr).filter(
            ([page]) => Number(page) >= from && Number(page) <= to,
          ),
        ),
      );
    },
  );
}

const pdfBytes = new TextEncoder().encode('%PDF-1.7 fictional');

const toPdfUnused = async () => {
  throw new Error('a PDF is not converted');
};

describe('ingestibleFormat', () => {
  it.each([
    ['Lease - Harbor Lane.pdf', 'pdf'],
    ['TAX RETURN 2024.PDF', 'pdf'],
    ['Asset purchase agreement.docx', 'office'],
    ['Old bylaws.doc', 'office'],
    ['Lender deck.pptx', 'office'],
    ['Old deck.ppt', 'office'],
    ['Financials.xlsx', 'xlsx'],
    ['Legacy model.xls', 'xls'],
    ['Customers.csv', 'csv'],
    ['Storefront.png', 'image'],
    ['Signed page.JPG', 'image'],
    ['Signed page.jpeg', 'image'],
    ['Scanned lease.tif', 'image'],
    ['Scanned lease.tiff', 'image'],
    ['Notes.txt', 'text'],
    ['README.md', 'text'],
    ['Archive.zip', null],
    ['README', null],
  ])('routes %s to %s', (name, format) => {
    expect(ingestibleFormat(name)).toBe(format);
  });
});

describe('extractSegments', () => {
  it('reads a PDF from its text layer alone when every page has text', async () => {
    const convert = fakeDocling({ 1: 'Lease term', 2: 'Rent schedule' }, {}, 2);

    const segments = await extractSegments(
      { name: 'Lease.pdf', bytes: pdfBytes, format: 'pdf' },
      { convert, toPdf: toPdfUnused },
      false,
    );

    expect(segments).toEqual([
      {
        kind: 'page',
        page_from: 1,
        page_to: 1,
        text: 'Lease term',
        from_ocr: false,
      },
      {
        kind: 'page',
        page_from: 2,
        page_to: 2,
        text: 'Rent schedule',
        from_ocr: false,
      },
    ]);
    expect(convert.mock.calls.map(([, , pass]) => pass)).toEqual([
      { ocr: 'none' },
    ]);
  });

  it('OCRs only the runs of pages with no text layer and marks their segments', async () => {
    const convert = fakeDocling(
      { 1: 'Cover letter', 4: 'Signature page' },
      { 2: 'Schedule C scanned', 3: 'Schedule E scanned', 5: 'W-2 scanned' },
      5,
    );

    const segments = await extractSegments(
      { name: 'Tax return 2024.pdf', bytes: pdfBytes, format: 'pdf' },
      { convert, toPdf: toPdfUnused },
      false,
    );

    expect(segments).toEqual([
      {
        kind: 'page',
        page_from: 1,
        page_to: 1,
        text: 'Cover letter',
        from_ocr: false,
      },
      {
        kind: 'page',
        page_from: 2,
        page_to: 2,
        text: 'Schedule C scanned',
        from_ocr: true,
      },
      {
        kind: 'page',
        page_from: 3,
        page_to: 3,
        text: 'Schedule E scanned',
        from_ocr: true,
      },
      {
        kind: 'page',
        page_from: 4,
        page_to: 4,
        text: 'Signature page',
        from_ocr: false,
      },
      {
        kind: 'page',
        page_from: 5,
        page_to: 5,
        text: 'W-2 scanned',
        from_ocr: true,
      },
    ]);
    expect(convert.mock.calls.map(([, , pass]) => pass)).toEqual([
      { ocr: 'none' },
      { ocr: 'force', pages: [2, 3] },
      { ocr: 'force', pages: [5, 5] },
    ]);
  });

  it('forces full-page OCR on every page when asked, ignoring the text layer', async () => {
    const convert = fakeDocling(
      { 1: 'Garbled text layer' },
      { 1: 'Signed agreement' },
      1,
    );

    const segments = await extractSegments(
      { name: 'Agreement.pdf', bytes: pdfBytes, format: 'pdf' },
      { convert, toPdf: toPdfUnused },
      true,
    );

    expect(segments).toEqual([
      {
        kind: 'page',
        page_from: 1,
        page_to: 1,
        text: 'Signed agreement',
        from_ocr: true,
      },
    ]);
    expect(convert.mock.calls.map(([, , pass]) => pass)).toEqual([
      { ocr: 'force' },
    ]);
  });

  it('converts a Word document to PDF first so its segments cite pages', async () => {
    const convert = fakeDocling({ 1: 'Bylaws article one' }, {}, 1);
    const docx = new TextEncoder().encode('fictional docx');
    const toPdf = vi.fn(async () => pdfBytes);

    const segments = await extractSegments(
      { name: 'Bylaws.docx', bytes: docx, format: 'office' },
      { convert, toPdf },
      false,
    );

    expect(toPdf).toHaveBeenCalledWith(docx, 'Bylaws.docx');
    expect(convert).toHaveBeenCalledWith(pdfBytes, 'Bylaws.pdf', {
      ocr: 'none',
    });
    expect(segments).toEqual([
      {
        kind: 'page',
        page_from: 1,
        page_to: 1,
        text: 'Bylaws article one',
        from_ocr: false,
      },
    ]);
  });

  it('reads a workbook into sheet blocks without Docling', async () => {
    const book = utils.book_new();
    utils.book_append_sheet(
      book,
      utils.aoa_to_sheet([
        ['Year', 'Revenue'],
        [2024, 1388000],
      ]),
      'P&L',
    );
    const bytes = new Uint8Array(
      write(book, { type: 'array', bookType: 'xlsx' }),
    );
    const convert = fakeDocling({}, {}, 0);

    const segments = await extractSegments(
      { name: 'Financials.xlsx', bytes, format: 'xlsx' },
      { convert, toPdf: toPdfUnused },
      false,
    );

    expect(segments).toEqual([
      {
        kind: 'sheet_block',
        sheet: 'P&L',
        cell_range: 'A2:B2',
        text: '1 | A: Year | B: Revenue\n2 | A: 2024 | B: 1388000',
        formulas: null,
        from_ocr: false,
      },
    ]);
    expect(convert).not.toHaveBeenCalled();
  });

  it('converts a PowerPoint deck to PDF first so its segments cite slides as pages', async () => {
    const convert = fakeDocling({ 1: 'Lender deck cover' }, {}, 1);
    const pptx = new TextEncoder().encode('fictional pptx');
    const toPdf = vi.fn(async () => pdfBytes);

    const segments = await extractSegments(
      { name: 'Lender deck.pptx', bytes: pptx, format: 'office' },
      { convert, toPdf },
      false,
    );

    expect(toPdf).toHaveBeenCalledWith(pptx, 'Lender deck.pptx');
    expect(segments).toEqual([
      {
        kind: 'page',
        page_from: 1,
        page_to: 1,
        text: 'Lender deck cover',
        from_ocr: false,
      },
    ]);
  });

  it('reads an image through Docling with OCR in one pass', async () => {
    const convert = fakeDocling({}, { 1: 'Signed by Priya Okafor' }, 1);
    const png = new TextEncoder().encode('fictional png');

    const segments = await extractSegments(
      { name: 'Signature.png', bytes: png, format: 'image' },
      { convert, toPdf: toPdfUnused },
      false,
    );

    expect(convert.mock.calls).toEqual([
      [png, 'Signature.png', { ocr: 'force' }],
    ]);
    expect(segments).toEqual([
      {
        kind: 'page',
        page_from: 1,
        page_to: 1,
        text: 'Signed by Priya Okafor',
        from_ocr: true,
      },
    ]);
  });

  it('pages plain text every 32,000 characters at line breaks', async () => {
    const line = `${'Harbor Lane note '.repeat(50)}`.trim();
    const lines = Array.from({ length: 60 }, () => line);
    const convert = fakeDocling({}, {}, 0);

    const segments = await extractSegments(
      {
        name: 'Notes.txt',
        bytes: new TextEncoder().encode(lines.join('\n')),
        format: 'text',
      },
      { convert, toPdf: toPdfUnused },
      false,
    );

    const perPage = Math.floor((32_000 + 1) / (line.length + 1));
    expect(segments).toEqual([
      {
        kind: 'page',
        page_from: 1,
        page_to: 1,
        text: lines.slice(0, perPage).join('\n'),
        from_ocr: false,
      },
      {
        kind: 'page',
        page_from: 2,
        page_to: 2,
        text: lines.slice(perPage).join('\n'),
        from_ocr: false,
      },
    ]);
    expect(convert).not.toHaveBeenCalled();
  });

  it('reads a legacy XLS workbook into sheet blocks', async () => {
    const book = utils.book_new();
    utils.book_append_sheet(
      book,
      utils.aoa_to_sheet([
        ['Year', 'Revenue'],
        [2019, 904000],
      ]),
      'P&L',
    );
    const bytes = new Uint8Array(
      write(book, { type: 'array', bookType: 'biff8' }),
    );

    const segments = await extractSegments(
      { name: 'Legacy model.xls', bytes, format: 'xls' },
      { convert: fakeDocling({}, {}, 0), toPdf: toPdfUnused },
      false,
    );

    expect(segments).toEqual([
      {
        kind: 'sheet_block',
        sheet: 'P&L',
        cell_range: 'A2:B2',
        text: '1 | A: Year | B: Revenue\n2 | A: 2019 | B: 904000',
        formulas: null,
        from_ocr: false,
      },
    ]);
  });
});
