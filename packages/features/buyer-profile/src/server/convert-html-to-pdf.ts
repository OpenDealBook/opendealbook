import { convertWithGotenberg } from '@odb/shared/gotenberg';

export async function convertHtmlToPdf(html: string): Promise<Uint8Array> {
  return convertWithGotenberg(
    '/forms/chromium/convert/html',
    new Blob([html], { type: 'text/html' }),
    'index.html',
  );
}
