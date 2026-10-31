import { convertWithGotenberg } from '@odb/shared/gotenberg';

const DOCX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export async function convertDocxToPdf(docx: Uint8Array): Promise<Uint8Array> {
  return convertWithGotenberg(
    '/forms/libreoffice/convert',
    new Blob([Uint8Array.from(docx)], { type: DOCX_CONTENT_TYPE }),
    'document.docx',
  );
}
