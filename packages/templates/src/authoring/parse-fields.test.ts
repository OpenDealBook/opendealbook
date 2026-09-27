import { describe, expect, it, vi } from 'vitest';

import type { DocxTemplateEngine } from '../superdoc';
import {
  draftFromKey,
  draftsToRows,
  extractPlaceholderKeys,
  fieldFromSelection,
  keysToDrafts,
  parseTemplateFields,
} from './parse-fields';

describe('extractPlaceholderKeys', () => {
  it('pulls unique keys from mustache placeholders', () => {
    const text =
      'Dear {{ firm.owner_name }}, offer for {{deal.asking_price}} and {{ firm.owner_name }}.';

    expect(extractPlaceholderKeys(text)).toEqual([
      'firm.owner_name',
      'deal.asking_price',
    ]);
  });

  it('returns empty when there are no placeholders', () => {
    expect(extractPlaceholderKeys('plain text')).toEqual([]);
  });
});

describe('draftFromKey', () => {
  it('maps a dotted deal key to its source and path', () => {
    expect(draftFromKey('deal.asking_price', 3)).toEqual({
      key: 'deal.asking_price',
      label: 'Asking Price',
      type: 'text',
      source: 'deal',
      source_path: 'asking_price',
      format: null,
      required: false,
      sort_order: 3,
    });
  });

  it('treats an unprefixed key as a manual field', () => {
    const draft = draftFromKey('buyer_signature', 0);

    expect(draft.source).toBe('manual');
    expect(draft.source_path).toBeNull();
    expect(draft.label).toBe('Buyer Signature');
  });
});

describe('keysToDrafts', () => {
  it('assigns sort order by position', () => {
    const drafts = keysToDrafts(['firm.name', 'buyer_name']);

    expect(drafts.map((draft) => draft.sort_order)).toEqual([0, 1]);
    expect(drafts[0]!.source).toBe('firm');
    expect(drafts[1]!.source).toBe('manual');
  });
});

describe('fieldFromSelection', () => {
  it('builds a draft and its placeholder token from a selection', () => {
    const result = fieldFromSelection({
      key: 'deal.close_date',
      sortOrder: 2,
      type: 'date',
      source: 'deal',
      sourcePath: 'close_date',
    });

    expect(result.placeholder).toBe('{{deal.close_date}}');
    expect(result.draft.type).toBe('date');
    expect(result.draft.source_path).toBe('close_date');
    expect(result.draft.sort_order).toBe(2);
  });
});

describe('draftsToRows', () => {
  it('binds drafts to a template id', () => {
    const rows = draftsToRows('tpl-1', keysToDrafts(['firm.name']));

    expect(rows[0]!.template_id).toBe('tpl-1');
    expect(rows[0]!.key).toBe('firm.name');
  });
});

describe('parseTemplateFields', () => {
  it('scans the docx through the engine and maps the keys', async () => {
    const engine: DocxTemplateEngine = {
      scanPlaceholders: vi.fn(async () => ['deal.asking_price', 'buyer_name']),
      fill: vi.fn(),
      renderPdf: vi.fn(),
    };

    const drafts = await parseTemplateFields(new Uint8Array(), engine);

    expect(engine.scanPlaceholders).toHaveBeenCalledOnce();
    expect(drafts.map((draft) => draft.source)).toEqual(['deal', 'manual']);
  });
});
