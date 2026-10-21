import { describe, expect, it } from 'vitest';

import { sellerAttachmentName } from './document-name';

describe('sellerAttachmentName', () => {
  it('names the PDF after the template and the firm', () => {
    expect(sellerAttachmentName('Letter of Intent', 'Acme Partners')).toBe(
      'Letter of Intent - Acme Partners.pdf',
    );
  });

  it('uses the template name alone when the deal has no firm', () => {
    expect(sellerAttachmentName('Letter of Intent', null)).toBe(
      'Letter of Intent.pdf',
    );
  });

  it('falls back to Document.pdf when the template was deleted', () => {
    expect(sellerAttachmentName(null, 'Acme Partners')).toBe('Document.pdf');
  });

  it('removes slashes and control characters and keeps spaces', () => {
    expect(
      sellerAttachmentName('LOI/APA\\Draft', 'Acme\u0000 Co\n\u007f'),
    ).toBe('LOIAPADraft - Acme Co.pdf');
  });

  it('removes Unicode format characters such as zero-width and bidi marks', () => {
    expect(
      sellerAttachmentName('Letter\u200b of\u202e Intent', 'Ac\u2066me'),
    ).toBe('Letter of Intent - Acme.pdf');
  });

  it('falls back to Document.pdf when nothing usable remains of the template name', () => {
    expect(sellerAttachmentName('/\u202e\u0000 ', 'Acme')).toBe('Document.pdf');
  });

  it('leaves the firm out when nothing usable remains of its name', () => {
    expect(sellerAttachmentName('LOI', '\u200b/')).toBe('LOI.pdf');
  });
});
