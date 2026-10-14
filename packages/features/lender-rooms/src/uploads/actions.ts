'use server';

import { z } from 'zod';

import { DATA_ROOM_BUCKET, dataRoomObjectPath } from '@odb/data-room/storage';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { refusableAction } from '../actions/refusable-action';
import { Refusal } from '../actions/refusal';
import { requireSpace, requireSpaceFolder } from './access';
import { storageKeyName, uploadRefusal } from './allowed';
import { removeObject } from './objects';
import { registerStoredUpload } from './register';
import { inRoomOrPackage } from './targets';

export const beginUpload = refusableAction(
  async (input, user) => {
    const refusal = uploadRefusal(input);

    if (refusal) {
      throw new Refusal(refusal);
    }

    const space = await requireSpaceFolder(input, input.folderId, 'Files');

    const admin = getSupabaseServerAdminClient();
    const upload = await admin
      .from('lender_upload')
      .insert({
        room_id: space.roomId,
        deal_id: space.deal_id,
        folder_id: input.folderId,
        name: input.name,
        storage_path: dataRoomObjectPath(
          space.deal_id,
          storageKeyName(input.name),
        ),
        uploaded_by: user.id,
      })
      .select('id, storage_path')
      .single()
      .throwOnError();
    const signed = await admin.storage
      .from(DATA_ROOM_BUCKET)
      .createSignedUploadUrl(upload.data.storage_path);

    if (signed.error) {
      throw signed.error;
    }

    return { uploadId: upload.data.id, ...signed.data };
  },
  {
    schema: inRoomOrPackage({
      folderId: z.uuid(),
      name: z.string().trim(),
      size: z.number().int().nonnegative(),
    }),
  },
);

export const registerUpload = refusableAction(
  async (input, user): Promise<string[]> => {
    const admin = getSupabaseServerAdminClient();
    const upload = await admin
      .from('lender_upload')
      .select('*')
      .eq('id', input.uploadId)
      .maybeSingle()
      .throwOnError();

    if (upload.data?.uploaded_by !== user.id) {
      throw new Refusal('That upload was not found');
    }

    const space = await requireSpace(
      upload.data.room_id
        ? { roomId: upload.data.room_id }
        : { dealId: upload.data.deal_id },
    );

    if (upload.data.document_ids) {
      return upload.data.document_ids;
    }

    return registerStoredUpload(admin, space, upload.data, input.keepAsZip);
  },
  {
    schema: z.object({
      uploadId: z.uuid(),
      keepAsZip: z.boolean(),
    }),
  },
);

export const cancelUpload = refusableAction(
  async (input, user): Promise<void> => {
    const admin = getSupabaseServerAdminClient();
    const upload = await admin
      .from('lender_upload')
      .select('storage_path, uploaded_by, registered_at')
      .eq('id', input.uploadId)
      .maybeSingle()
      .throwOnError();

    if (upload.data?.uploaded_by !== user.id) {
      throw new Refusal('That upload was not found');
    }

    if (upload.data.registered_at) {
      throw new Refusal('That file has already been added');
    }

    await removeObject(admin, upload.data.storage_path);
    await admin
      .from('lender_upload')
      .delete()
      .eq('id', input.uploadId)
      .throwOnError();
  },
  { schema: z.object({ uploadId: z.uuid() }) },
);
