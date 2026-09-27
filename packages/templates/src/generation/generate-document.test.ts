import { describe, expect, it, vi } from 'vitest';

import type { Tables } from '@tuckin/supabase';

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
  it('fills, renders and uploads both artifacts, returning the row', async () => {
    const filled = new Uint8Array([1]);
    const pdf = new Uint8Array([2]);

    const engine: DocxTemplateEngine = {
      scanPlaceholders: vi.fn(),
      fill: vi.fn(async () => filled),
      renderPdf: vi.fn(async () => pdf),
    };
    const storage: TemplateStorage = {
      downloadTemplate: vi.fn(async () => new Uint8Array([0])),
      uploadGenerated: vi.fn(async () => undefined),
    };

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
    expect(storage.uploadGenerated).toHaveBeenCalledTimes(2);
    expect(row.account_id).toBe('acc-1');
    expect(row.deal_id).toBe('deal-1');
    expect(row.template_version).toBe(4);
    expect(row.docx_path).toMatch(/^acc-1\/deal-1\/.+\.docx$/);
    expect(row.pdf_path).toMatch(/^acc-1\/deal-1\/.+\.pdf$/);
    expect(row.contract_id).toBeNull();
  });
});
