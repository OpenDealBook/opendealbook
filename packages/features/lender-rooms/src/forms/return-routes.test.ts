import { describe, expect, it } from 'vitest';

import { allowedReturnRoutes } from './return-routes';

describe('the return routes a lender may choose for a blank form', () => {
  it.each([
    'application.pdf',
    'application.docx',
    'legacy.doc',
    'LEGACY.DOC',
    'APPLICATION.PDF',
    'Form.v2.Docx',
  ])('include completed-file upload and e-sign for %s', (fileName) => {
    expect(allowedReturnRoutes(fileName)).toEqual(['upload', 'esign']);
  });

  it.each([
    'rent-roll.xlsx',
    'template.dot',
    'scan.png',
    'notes.txt',
    'archive.pdf.zip',
    'pdf',
    'no-extension',
  ])('are completed-file upload only for %s', (fileName) => {
    expect(allowedReturnRoutes(fileName)).toEqual(['upload']);
  });
});
