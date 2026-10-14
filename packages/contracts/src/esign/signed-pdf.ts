const PDF_HEADER = '%PDF';

export const MAX_SIGNED_PDF_BYTES = 300 * 1024 * 1024;

export function assertSignedPdf(bytes: Uint8Array): void {
  const header = String.fromCharCode(...bytes.subarray(0, PDF_HEADER.length));

  if (header !== PDF_HEADER) {
    throw new Error('Documenso returned a signed file that is not a PDF');
  }

  if (bytes.length > MAX_SIGNED_PDF_BYTES) {
    throw new Error(
      'Documenso returned a signed PDF larger than the 300 MiB limit',
    );
  }
}
