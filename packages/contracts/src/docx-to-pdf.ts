import { requireEnv } from '@odb/shared/env';
import { getLogger } from '@odb/shared/logger';

import { DOCX_CONTENT_TYPE } from './storage';

const CONVERSION_TIMEOUT_MS = 60_000;

export async function convertDocxToPdf(
  docx: Uint8Array,
): Promise<Uint8Array | null> {
  const url = `${requireEnv('GOTENBERG_URL')}/forms/libreoffice/convert`;
  const form = new FormData();
  form.append(
    'files',
    new Blob([Uint8Array.from(docx)], { type: DOCX_CONTENT_TYPE }),
    'contract.docx',
  );

  try {
    const response = await fetch(url, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(CONVERSION_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(
        `Gotenberg answered ${response.status}: ${(await response.text()).slice(0, 200)}`,
      );
    }

    return new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    getLogger().warn({ err: error }, 'Contract Word to PDF conversion failed');

    return null;
  }
}
