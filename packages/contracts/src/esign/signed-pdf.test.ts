import { describe, expect, it } from 'vitest';

import { MAX_SIGNED_PDF_BYTES, assertSignedPdf } from './signed-pdf';

const PDF_HEADER = [37, 80, 68, 70];

describe('what we accept from Documenso as a signed PDF', () => {
  it('accepts bytes that start as a PDF does', () => {
    expect(() =>
      assertSignedPdf(new Uint8Array([...PDF_HEADER, 45, 49, 46, 55])),
    ).not.toThrow();
  });

  it.each([
    ['an error page', Buffer.from('<html>Sign in</html>')],
    ['nothing', new Uint8Array()],
  ])('refuses %s', (_label, bytes) => {
    expect(() => assertSignedPdf(bytes)).toThrow(
      'Documenso returned a signed file that is not a PDF',
    );
  });

  it('refuses a PDF larger than the 300 MiB file limit', () => {
    const oversize = new Uint8Array(MAX_SIGNED_PDF_BYTES + 1);
    oversize.set(PDF_HEADER);

    expect(() => assertSignedPdf(oversize)).toThrow(
      'Documenso returned a signed PDF larger than the 300 MiB limit',
    );
  });

  it('accepts a PDF of exactly the file limit', () => {
    const atLimit = new Uint8Array(MAX_SIGNED_PDF_BYTES);
    atLimit.set(PDF_HEADER);

    expect(() => assertSignedPdf(atLimit)).not.toThrow();
  });
});
