import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Tables } from '@odb/supabase';

import type { TemplateStorage } from '../storage';
import type { DocxTemplateEngine } from '../superdoc';
import { generateDocument, type LoadedTemplate } from './generate-document';
import type { DealContext } from './resolve-fields';

const template: LoadedTemplate = {
  row: {
    id: 'tpl-1',
    account_id: 'acc-1',
    version: 4,
    name: 'NDA',
    type: 'nda',
    docx_path: null,
    created_at: null,
    created_by: null,
    updated_at: null,
  },
  fields: [
    {
      id: 'f1',
      template_id: 'tpl-1',
      key: 'firm.name',
      label: null,
      type: 'text',
      source: 'firm',
      source_path: 'name',
      format: null,
      required: true,
      sort_order: 0,
    },
  ],
};

const deal: DealContext = {
  deal: { id: 'deal-1', account_id: 'acc-1' } as unknown as Tables<'deal'>,
  firm: { name: 'Acme LLC' } as unknown as Tables<'firm'>,
  account: {},
};

describe('generateDocument', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fills, converts to pdf via gotenberg and uploads both artifacts', async () => {
    const filled = new Uint8Array([1]);
    const pdf = new Uint8Array([2]);

    const engine: DocxTemplateEngine = {
      scanPlaceholders: vi.fn(),
      fill: vi.fn(async () => filled),
    };
    const storage: TemplateStorage = {
      downloadTemplate: vi.fn(async () => new Uint8Array([0])),
      uploadGenerated: vi.fn(async () => undefined),
    };
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      arrayBuffer: async () => pdf.buffer,
    }));
    vi.stubGlobal('fetch', fetchMock);

    const row = await generateDocument(
      { template, deal, fieldValues: {} },
      { engine, storage },
    );

    expect(storage.downloadTemplate).toHaveBeenCalledWith(
      'acc-1/tpl-1/v4.docx',
    );
    expect(engine.fill).toHaveBeenCalledWith(new Uint8Array([0]), {
      'firm.name': 'Acme LLC',
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:3009/forms/libreoffice/convert');
    const sent = (init.body as FormData).get('files') as Blob;
    expect(new Uint8Array(await sent.arrayBuffer())).toEqual(filled);

    expect(storage.uploadGenerated).toHaveBeenNthCalledWith(
      2,
      row.pdf_path,
      pdf,
      'application/pdf',
    );
    expect(row.docx_path).toMatch(/^acc-1\/deal-1\/.+\.docx$/);
    expect(row.pdf_path).toMatch(/^acc-1\/deal-1\/.+\.pdf$/);
    expect(row.contract_id).toBeNull();
  });
});
