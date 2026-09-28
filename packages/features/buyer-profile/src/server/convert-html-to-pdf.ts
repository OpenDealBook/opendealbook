import { getEnv } from '@tuckin/shared/env';

export async function convertHtmlToPdf(html: string): Promise<Uint8Array> {
  const base = getEnv('GOTENBERG_URL', 'http://localhost:3009');
  const form = new FormData();
  form.append('files', new Blob([html], { type: 'text/html' }), 'index.html');

  const response = await fetch(`${base}/forms/chromium/convert/html`, {
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
