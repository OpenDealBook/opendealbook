import { describe, expect, it } from 'vitest';

import type { AnswerPart } from './parts';
import { parseStoredParts, partsText, withPartsText } from './stored-parts';

const shown = { kind: 'document', v: 1, version: 1 } as const;
const CIM: AnswerPart = {
  ...shown,
  id: 1,
  documentId: 'd1',
  documentName: 'cim.pdf',
  page: 3,
  note: 'The customer list.',
};
const MODEL: AnswerPart = {
  ...shown,
  id: 2,
  documentId: 'd2',
  documentName: 'model.xlsx',
  sheet: 'P&L',
};
const LEASE: AnswerPart = {
  ...shown,
  id: 3,
  documentId: 'd3',
  documentName: 'lease.pdf',
};

describe('partsText', () => {
  it('writes each part as a searchable line naming where it opens and its note', () => {
    expect(partsText([CIM, MODEL, LEASE])).toBe(
      'Document: cim.pdf (page 3). The customer list.\nDocument: model.xlsx (sheet P&L)\nDocument: lease.pdf',
    );
  });
});

describe('withPartsText', () => {
  const readable = new Set(['d1', 'd2']);

  it('replaces each figure marker with the text of its part and removes a marker with no part', () => {
    expect(
      withPartsText(
        'Customers are here.\n[[figure 1]]\nAlso [[figure 9]].',
        [CIM],
        readable,
      ),
    ).toBe(
      'Customers are here.\nDocument: cim.pdf (page 3). The customer list.\nAlso .',
    );
  });

  it('writes the text of a part only at its first marker', () => {
    expect(
      withPartsText('[[figure 1]] and again [[figure 1]].', [CIM], readable),
    ).toBe('Document: cim.pdf (page 3). The customer list. and again .');
  });

  it('appends the text of each part the answer never placed', () => {
    expect(withPartsText('See [[figure 2]].', [CIM, MODEL], readable)).toBe(
      'See Document: model.xlsx (sheet P&L).\nDocument: cim.pdf (page 3). The customer list.',
    );
  });

  it('keeps the name but drops the note of a part whose document is no longer readable', () => {
    expect(withPartsText('[[figure 1]]', [CIM], new Set(['d2']))).toBe(
      'Document: cim.pdf (page 3)',
    );
  });
});

describe('parseStoredParts', () => {
  it('keeps the parts that parse and drops the rest', () => {
    expect(
      parseStoredParts(
        [CIM, { id: 'part-1', kind: 'chart', v: 1, title: 'Revenue chart' }],
        'question-1',
      ),
    ).toEqual([CIM]);
  });
});
