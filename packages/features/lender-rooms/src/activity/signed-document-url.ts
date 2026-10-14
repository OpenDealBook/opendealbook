import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { DATA_ROOM_BUCKET } from '@odb/data-room/storage';
import type { Database } from '@odb/supabase';

import { ensurePreviewRendition } from '../uploads/renditions';
import { isOwnDealStoragePath } from './storage-path';

const SIGNED_URL_SECONDS = 60;

const PREVIEW_RENDITIONS = [
  { source: /\.hei[cf]$/i, suffix: '.preview.jpg' },
  { source: /\.pptx$/i, suffix: '.preview.pdf' },
];

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

  if (disposition === 'preview') {
    const rendition = PREVIEW_RENDITIONS.find(({ source }) =>
      source.test(document.name),
    );

    if (rendition) {
      await ensurePreviewRendition(admin, {
        storagePath: document.storage_path,
        name: document.name,
      });
      signedPath = `${document.storage_path}${rendition.suffix}`;
    }
  }

  const { data, error } = await admin.storage
    .from(DATA_ROOM_BUCKET)
    .createSignedUrl(signedPath, SIGNED_URL_SECONDS, {
      download: disposition === 'download' ? document.name : true,
    });

  if (error) {
    throw error;
  }

  return data.signedUrl;
}
