import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parsePreview } from './parse-preview';

// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const UNSUPPORTED = { kind: 'none', reason: 'unsupported' };
const PDF_WORKER = 'pdfjs-dist/legacy/build/pdf.worker.mjs';

function fixture(name: string): ArrayBuffer {
  return Uint8Array.from(
    readFileSync(join(import.meta.dirname, 'fixtures', name)),
  ).buffer;
}

function encoded(text: string): ArrayBuffer {
  return Uint8Array.from(new TextEncoder().encode(text)).buffer;
}

function htmlDocument(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

async function emailBodyDocument(
  kind: 'msg' | 'eml',
  name: string,
): Promise<Document> {
  const preview = await parsePreview(kind, fixture(name));
  if (preview.kind !== 'email' || preview.body.kind !== 'html') {
    throw new Error(JSON.stringify(preview));
  }
  return htmlDocument(preview.body.srcDoc);
}

async function wordDocument(): Promise<Document> {
  const preview = await parsePreview('word', fixture('hostile.docx'));
  if (preview.kind !== 'word') throw new Error(JSON.stringify(preview));
  return htmlDocument(preview.srcDoc);
}

describe('parsePreview', () => {
  beforeEach(async () => {
    vi.stubGlobal('pdfjsWorker', await import(/* @vite-ignore */ PDF_WORKER));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.doUnmock('mammoth');
  });

  describe('PDF', () => {
    it('opens a PDF and knows its page count', async () => {
      const preview = await parsePreview('pdf', fixture('sample.pdf'));

      expect(preview).toMatchObject({ kind: 'pdf', document: { numPages: 2 } });
    });

    it('reports a password-protected PDF as such', async () => {
      const preview = await parsePreview('pdf', fixture('locked.pdf'));

      expect(preview).toEqual({ kind: 'none', reason: 'password-protected' });
    });

    it('has no preview for a truncated PDF', async () => {
      const preview = await parsePreview(
        'pdf',
        fixture('sample.pdf').slice(0, 300),
      );

      expect(preview).toEqual(UNSUPPORTED);
    });
  });

  describe('Word', () => {
    it('keeps bold text', async () => {
      const body = (await wordDocument()).body;

      expect(body.querySelector('strong')?.textContent).toBe(
        'Covenant summary',
      );
    });

    it('keeps tables', async () => {
      const body = (await wordDocument()).body;

      expect(body.querySelector('td')?.textContent).toBe('Year');
    });

    it('keeps images embedded in the file', async () => {
      const body = (await wordDocument()).body;

      expect(body.querySelector('img')?.getAttribute('src')).toMatch(
        /^data:image\/png;base64,/,
      );
    });

    it('leaves no script element from a hostile file', async () => {
      const document = await wordDocument();

      expect(document.querySelector('script')).toBeNull();
      expect(document.body.textContent).toContain('<script>alert(1)</script>');
    });

    it('leaves no link from a hostile file', async () => {
      const document = await wordDocument();

      expect(document.querySelector('a, [href]')).toBeNull();
      expect(document.documentElement.outerHTML).not.toContain('javascript:');
    });

    it('leaves no remote reference from a hostile file', async () => {
      const document = await wordDocument();

      expect(document.documentElement.outerHTML).not.toContain(
        'tracker.example',
      );
    });

    it('has no preview for a truncated Word file', async () => {
      const preview = await parsePreview(
        'word',
        fixture('hostile.docx').slice(0, 300),
      );

      expect(preview).toEqual(UNSUPPORTED);
    });

    it('fails loudly when the Word library cannot be loaded', async () => {
      vi.doMock('mammoth', () => {
        throw new Error('Loading chunk failed');
      });

      await expect(
        parsePreview('word', fixture('hostile.docx')),
      ).rejects.toThrow();
    });
  });

  describe('spreadsheets', () => {
    it('reads every sheet of a workbook as rows of cell text, blank cells included', async () => {
      const preview = await parsePreview('sheet', fixture('sample.xlsx'));

      expect(preview).toEqual({
        kind: 'sheet',
        sheets: [
          {
            name: 'Summary',
            rows: [
              ['Metric', 'Value'],
              ['Revenue', '1200'],
              ['EBITDA', '300'],
            ],
            clippedRows: false,
            clippedColumns: false,
          },
          {
            name: 'Rent roll',
            rows: [
              ['Unit', 'Rent', 'Status'],
              ['A1', '950', 'Let'],
              ['A2', '', 'Vacant'],
            ],
            clippedRows: false,
            clippedColumns: false,
          },
        ],
      });
    });

    it('reads a legacy .xls workbook', async () => {
      const preview = await parsePreview('sheet', fixture('sample.xls'));

      expect(preview).toMatchObject({
        sheets: [
          {
            name: 'Legacy',
            rows: [
              ['Lender', 'Amount'],
              ['First Bank', '500000'],
            ],
          },
        ],
      });
    });

    it('reads a legacy workbook in the code page it declares', async () => {
      const preview = await parsePreview('sheet', fixture('cyrillic.xls'));

      expect(preview).toMatchObject({
        sheets: [
          {
            rows: [
              ['Tenant', 'City'],
              ['Дом', 'Kyiv'],
            ],
          },
        ],
      });
    });

    it.each(['sample.xlsx', 'sample.xls', 'sample.csv'])(
      'reads %s without a code page warning',
      async (name) => {
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
        const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {});

        await parsePreview('sheet', fixture(name));

        expect([...errors.mock.calls, ...warnings.mock.calls]).toEqual([]);
      },
    );

    it('reads a CSV file as a single sheet', async () => {
      const preview = await parsePreview('sheet', fixture('sample.csv'));

      expect(preview).toMatchObject({
        sheets: [
          {
            name: 'Sheet1',
            rows: [
              ['Lender', 'Amount'],
              ['First Bank', '500000'],
            ],
          },
        ],
      });
    });

    it('reads CSV text as UTF-8', async () => {
      const preview = await parsePreview('sheet', fixture('accents.csv'));

      expect(preview).toMatchObject({
        sheets: [
          {
            rows: [
              ['Tenant', 'City'],
              ['Café Zürich', 'Genève'],
            ],
          },
        ],
      });
    });

    it('keeps only the first 2,000 rows and 50 columns of a sheet that declares the whole grid', async () => {
      const started = performance.now();

      const preview = await parsePreview('sheet', fixture('corners.xlsx'));

      expect(performance.now() - started).toBeLessThan(1000);
      if (preview.kind !== 'sheet') throw new Error(JSON.stringify(preview));
      const [sheet] = preview.sheets;
      expect(sheet?.rows).toHaveLength(2000);
      expect(sheet?.rows[0]).toHaveLength(50);
      expect(sheet?.rows[0]?.[0]).toBe('first');
      expect(sheet).toMatchObject({ clippedRows: true, clippedColumns: true });
    });

    it('has no preview for a truncated workbook', async () => {
      const preview = await parsePreview(
        'sheet',
        fixture('sample.xlsx').slice(0, 300),
      );

      expect(preview).toEqual(UNSUPPORTED);
    });
  });

  describe('Outlook .msg', () => {
    it('reads every part of a message', async () => {
      const preview = await parsePreview('msg', fixture('plain.msg'));

      expect(preview).toEqual({
        kind: 'email',
        from: { name: 'Dana Whitfield', address: 'dana@firstbank.example' },
        to: [{ name: 'Sam Ortiz', address: 'sam@buyer.example' }],
        cc: [{ name: 'Lee Park', address: 'lee@buyer.example' }],
        date: 'Wed, 04 Mar 2026 15:30:00 GMT',
        subject: 'Updated rent roll',
        body: {
          kind: 'text',
          text: 'Please see the attached rent roll.\r\nDana',
        },
        attachmentNames: ['rent-roll.xlsx'],
      });
    });

    it('leaves blanks for a missing sender, date, subject, and address, and labels unnamed attachments', async () => {
      const preview = await parsePreview('msg', fixture('bare.msg'));

      expect(preview).toMatchObject({
        from: { name: '', address: '' },
        to: [{ name: 'Sam Ortiz', address: '' }],
        cc: [],
        date: '',
        subject: '',
        attachmentNames: ['Inline image', 'Attachment'],
      });
    });

    it('decodes an HTML body with the code page the message declares', async () => {
      const document = await emailBodyDocument('msg', 'bare.msg');

      expect(document.body.textContent).toBe('Café Zürich lease');
    });

    it('keeps the formatting of an HTML body', async () => {
      const document = await emailBodyDocument('msg', 'hostile.msg');

      expect(document.body.querySelector('b')?.textContent).toBe('attached');
    });

    it('leaves no script or handler from a hostile HTML body', async () => {
      const document = await emailBodyDocument('msg', 'hostile.msg');

      expect(document.querySelector('script, [onclick], [onerror]')).toBeNull();
      expect(document.documentElement.outerHTML).not.toContain('alert(');
    });

    it('leaves no remote reference from a hostile HTML body', async () => {
      const document = await emailBodyDocument('msg', 'hostile.msg');

      expect(document.querySelector('iframe, [href], [style]')).toBeNull();
      expect(document.documentElement.outerHTML).not.toContain(
        'tracker.example',
      );
    });

    it('has no preview for a truncated message', async () => {
      const preview = await parsePreview(
        'msg',
        fixture('plain.msg').slice(0, 300),
      );

      expect(preview).toEqual(UNSUPPORTED);
    });

    it('has no preview for a file that is not an Outlook message despite its name', async () => {
      const preview = await parsePreview('msg', fixture('sample.csv'));

      expect(preview).toEqual(UNSUPPORTED);
    });
  });

  describe('.eml', () => {
    it('reads every part of a message', async () => {
      const preview = await parsePreview('eml', fixture('sample.eml'));

      expect(preview).toEqual({
        kind: 'email',
        from: { name: 'Dana Whitfield', address: 'dana@firstbank.example' },
        to: [{ name: 'Sam Ortiz', address: 'sam@buyer.example' }],
        cc: [{ name: 'Lee Park', address: 'lee@buyer.example' }],
        date: 'Wed, 04 Mar 2026 15:30:00 GMT',
        subject: 'Updated rent roll',
        body: {
          kind: 'text',
          text: 'Please see the attached rent roll.\nDana',
        },
        attachmentNames: ['rent-roll.xlsx'],
      });
    });

    it('leaves blanks for a missing sender, date, subject, and address, and labels unnamed attachments', async () => {
      const preview = await parsePreview('eml', fixture('bare.eml'));

      expect(preview).toMatchObject({
        from: { name: '', address: '' },
        to: [{ name: 'undisclosed-recipients', address: '' }],
        cc: [],
        date: '',
        subject: '',
        attachmentNames: ['Inline image', 'Attachment'],
      });
    });

    it('shows nothing for a date it cannot read', async () => {
      const preview = await parsePreview(
        'eml',
        encoded(
          'Date: sometime soon\r\nSubject: Rent roll\r\n\r\nSee attached.',
        ),
      );

      expect(preview).toMatchObject({ date: '', subject: 'Rent roll' });
    });

    it('leaves no script or handler from a hostile HTML body', async () => {
      const document = await emailBodyDocument('eml', 'hostile.eml');

      expect(document.querySelector('script, [onclick], [onerror]')).toBeNull();
      expect(document.documentElement.outerHTML).not.toContain('alert(');
    });

    it('leaves no remote reference from a hostile HTML body', async () => {
      const document = await emailBodyDocument('eml', 'hostile.eml');

      expect(document.querySelector('iframe, [href], [style]')).toBeNull();
      expect(document.documentElement.outerHTML).not.toContain(
        'tracker.example',
      );
    });
  });

  describe('text', () => {
    it('reads a text file as its characters, markup included', async () => {
      const preview = await parsePreview('text', fixture('hostile.md'));

      expect(preview).toEqual({
        kind: 'text',
        text: '# Diligence notes\n\n<script>alert(1)</script>\n<img src="https://tracker.example/open.gif" onerror="alert(2)">\n',
      });
    });

    it('honours a byte order mark', async () => {
      const preview = await parsePreview(
        'text',
        Uint8Array.from([0xff, 0xfe, 0xe9, 0x00]).buffer,
      );

      expect(preview).toEqual({ kind: 'text', text: 'é' });
    });
  });
});
