'use server';

import { expandUploadBatch } from '@odb/data-room/uploads/actions';
import { ensurePreviewRendition } from '@odb/lender-rooms/uploads/renditions.ts';
import { getLogger } from '@odb/shared/logger';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

export async function expandDataRoomUpload(
  input: Parameters<typeof expandUploadBatch>[0],
) {
  const expanded = await expandUploadBatch(input);

  if (expanded.ok) {
    const admin = getSupabaseServerAdminClient();
    const wordFiles = expanded.value.items.filter(
      (item) =>
        item.status === 'imported' && /\.docx$/i.test(item.original_path),
    );

    for (const item of wordFiles) {
      await ensurePreviewRendition(admin, {
        storagePath: item.storage_path,
        name: item.original_path,
      }).catch((error: unknown) =>
        getLogger().error(
          { err: error, storagePath: item.storage_path },
          'Document uploaded without a preview rendition',
        ),
      );
    }
  }

  return expanded;
}
