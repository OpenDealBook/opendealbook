import { describe, expect, it } from 'vitest';

import { citationLabel } from './citations';

const document = { documentId: 'doc-1', documentName: 'cim.pdf', version: 2 };

describe('citationLabel', () => {
  it('names a page range', () => {
    expect(citationLabel({ ...document, pageFrom: 4, pageTo: 5 })).toBe(
      'cim.pdf v2, p. 4-5',
    );
  });

  it('names a sheet and cell range', () => {
    expect(
      citationLabel({
        ...document,
        documentName: 'model.xlsx',
        version: 1,
        sheet: 'Sheet1',
        cellRange: 'A1:C9',
      }),
    ).toBe('model.xlsx v1, Sheet1!A1:C9');
  });
});
