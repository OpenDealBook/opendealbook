import 'server-only';
import { StorageApiError } from '@supabase/supabase-js';

import { DATA_ROOM_BUCKET } from '@odb/data-room/storage';
import { getLogger } from '@odb/shared/logger';

import { type Admin, storedSize } from '../uploads/objects';
import { ensurePreviewRendition } from '../uploads/renditions';

export const PREVIEW_RENDITIONS = [
  { source: /\.hei[cf]$/i, suffix: '.preview.jpg' },
  { source: /\.(?:pptx|docx)$/i, suffix: '.preview.pdf' },
];
const OBJECT_ALREADY_EXISTS = '409';

export async function copyAnswerFile(
  admin: Admin,
  source: { name: string; storage_path: string },
  destinationPath: string,
) {
  await copyOnce(admin, source.storage_path, destinationPath);

  const rendition = PREVIEW_RENDITIONS.find((candidate) =>
    candidate.source.test(source.storage_path),
  );

  if (!rendition) {
    return;
  }

  const sourcePreviewPath = `${source.storage_path}${rendition.suffix}`;

  if ((await storedSize(admin, sourcePreviewPath)) !== null) {
    await copyOnce(
      admin,
      sourcePreviewPath,
      `${destinationPath}${rendition.suffix}`,
    );
    return;
  }

  getLogger().error(
    { storagePath: source.storage_path },
    'Answer file has no preview rendition to copy',
  );

  try {
    await ensurePreviewRendition(admin, {
      storagePath: destinationPath,
      name: source.name,
    });
  } catch (error) {
    getLogger().error(
      { err: error, storagePath: destinationPath },
      'FAQ file copied without a preview rendition',
    );
  }
}

async function copyOnce(admin: Admin, from: string, to: string) {
  const { error } = await admin.storage.from(DATA_ROOM_BUCKET).copy(from, to);

  if (
    error &&
    !(
      error instanceof StorageApiError &&
      error.statusCode === OBJECT_ALREADY_EXISTS
    )
  ) {
    throw error;
  }
}
