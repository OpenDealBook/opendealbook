import { getEnv } from '@tuckin/shared/env';

const DOCX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export async function convertDocxToPdf(docx: Uint8Array): Promise<Uint8Array> {
  const base = getEnv('GOTENBERG_URL', 'http://localhost:3009');
  const form = new FormData();
  form.append(
    'files',
    new Blob([Uint8Array.from(docx)], { type: DOCX_CONTENT_TYPE }),
    'document.docx',
  );

  const response = await fetch(`${base}/forms/libreoffice/convert`, {
    method: 'POST',
    body: form,
  });

  if (!response.ok) {
    const snippet = (await response.text()).slice(0, 200);
    throw new Error(
      `Gotenberg conversion failed: ${response.status} ${snippet}`,
    );
  }

  return new Uint8Array(await response.arrayBuffer());
}
