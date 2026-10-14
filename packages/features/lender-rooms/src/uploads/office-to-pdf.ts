import 'server-only';
import { getEnv } from '@odb/shared/env';

import { contentTypeFor } from './content-type';

const CONVERSION_TIMEOUT_MS = 60_000;
export const FILE_EXTENSION = /\.[^.]+$/;

export async function convertOfficeToPdf(
  office: Uint8Array,
  fileName: string,
): Promise<Uint8Array> {
  const base = getEnv('GOTENBERG_URL', 'http://localhost:3009');
  const form = new FormData();
  form.append(
    'files',
    new Blob([Uint8Array.from(office)], { type: contentTypeFor(fileName) }),
    `document${FILE_EXTENSION.exec(fileName)![0].toLowerCase()}`,
  );

  const response = await fetch(`${base}/forms/libreoffice/convert`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(CONVERSION_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Gotenberg conversion failed: ${response.status}`);
  }

  return new Uint8Array(await response.arrayBuffer());
}
