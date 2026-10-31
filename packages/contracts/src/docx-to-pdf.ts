import { requireEnv } from '@odb/shared/env';
import { convertWithGotenberg } from '@odb/shared/gotenberg';
import { getLogger } from '@odb/shared/logger';

import { DOCX_CONTENT_TYPE } from './storage';

export async function convertDocxToPdf(
  docx: Uint8Array,
): Promise<Uint8Array | null> {
  requireEnv('GOTENBERG_URL');

  try {
    return await convertWithGotenberg(
      '/forms/libreoffice/convert',
      new Blob([Uint8Array.from(docx)], { type: DOCX_CONTENT_TYPE }),
      'contract.docx',
    );
  } catch (error) {
    getLogger().warn({ err: error }, 'Contract Word to PDF conversion failed');

    return null;
  }
}
