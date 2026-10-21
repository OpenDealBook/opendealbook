import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

import { z } from 'zod';

import { DATA_ROOM_BUCKET } from '@odb/data-room/storage';
import { isOwnDealStoragePath } from '@odb/data-room/storage-path';
import type { Database } from '@odb/supabase';

import { storedSize } from '../uploads/objects';
import {
  ensurePreviewRendition,
  previewRendition,
} from '../uploads/renditions';
import { withDownloadName } from './download-name';

const SIGNED_URL_SECONDS = 60;

export const dispositionSchema = z.enum(['preview', 'download']);

export async function signedDocumentUrl(
  admin: SupabaseClient<Database>,
  document: { name: string; deal_id: string; storage_path: string },
  disposition: z.infer<typeof dispositionSchema>,
): Promise<string | null> {
  if (!isOwnDealStoragePath(document)) {
    return null;
  }

  let signedPath = document.storage_path;

  const rendition = previewRendition(document.name);

  if (disposition === 'preview' && rendition) {
    const previewPath = `${document.storage_path}${rendition.suffix}`;

    if (rendition.madeOnView) {
      await ensurePreviewRendition(admin, {
        storagePath: document.storage_path,
        name: document.name,
      });
      signedPath = previewPath;
    } else if ((await storedSize(admin, previewPath)) !== null) {
      signedPath = previewPath;
    }
  }

  const { data, error } = await admin.storage
    .from(DATA_ROOM_BUCKET)
    .createSignedUrl(signedPath, SIGNED_URL_SECONDS, { download: true });

  if (error) {
    throw error;
  }

  return disposition === 'download'
    ? withDownloadName(data.signedUrl, document.name)
    : data.signedUrl;
}
