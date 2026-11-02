import { afterEach, describe, expect, it, vi } from 'vitest';

import { convertFile, extractMarkdown } from './docling';

const config = { baseUrl: 'http://docling.test', apiKey: 'x-key' };

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubSequence(bodies: unknown[]) {
  const queue = [...bodies];
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => ({
    json: async () => queue.shift(),
  }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

describe('extractMarkdown', () => {
  it('enqueues an async convert, polls to success and returns the markdown result', async () => {
    stubSequence([
      { task_id: 't1' },
      { task_status: 'pending' },
      { task_status: 'success' },
      { document: { md_content: '# Extracted' } },
    ]);

    await expect(extractMarkdown(config, 'http://signed')).resolves.toBe(
      '# Extracted',
    );
  });

  it('throws when the conversion task reports failure', async () => {
    stubSequence([{ task_id: 't1' }, { task_status: 'failure' }]);

    await expect(extractMarkdown(config, 'http://signed')).rejects.toThrow(
      /t1/,
    );
  });
});

describe('convertFile', () => {
  const document = { body: { self_ref: '#/body' } };

  it.each([
    [
      'reads the text layer only',
      { ocr: 'none' } as const,
      { do_ocr: ['false'], force_ocr: ['false'], page_range: [] },
    ],
    [
      'forces full-page OCR on a page range',
      { ocr: 'force', pages: [3, 5] } as const,
      { do_ocr: ['true'], force_ocr: ['true'], page_range: ['3', '5'] },
    ],
    [
      'forces full-page OCR on every page',
      { ocr: 'force' } as const,
      { do_ocr: ['true'], force_ocr: ['true'], page_range: [] },
    ],
  ])(
    'uploads the file for the lossless JSON document and %s',
    async (_case, pass, fields) => {
      const fetch = stubSequence([
        { task_id: 't1' },
        { task_status: 'success' },
        { document: { json_content: document } },
      ]);

      await expect(
        convertFile(config, new Uint8Array([1, 2]), 'lease.pdf', pass),
      ).resolves.toEqual(document);

      const [url, init] = fetch.mock.calls[0]!;
      const form = init!.body as FormData;
      expect(url).toBe('http://docling.test/v1/convert/file/async');
      expect(init!.headers).toEqual({ 'x-api-key': 'x-key' });
      expect((form.get('files') as File).name).toBe('lease.pdf');
      expect({
        to_formats: form.getAll('to_formats'),
        do_ocr: form.getAll('do_ocr'),
        force_ocr: form.getAll('force_ocr'),
        page_range: form.getAll('page_range'),
      }).toEqual({ to_formats: ['json'], ...fields });
    },
  );
});
