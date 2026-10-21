'use server';

import { z } from 'zod';

import { DATA_ROOM_BUCKET, dataRoomObjectPath } from '@odb/data-room/storage';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { refusableAction } from '../actions/refusable-action';
import { Refusal } from '../actions/refusal';
import {
  isWithinFolder,
  requireSpace,
  requireSpaceFolder,
} from './access';
import { uploadRefusal } from './allowed';
import { queueCounselUpload } from './counsel-uploads';
import { type Admin, removeObject } from './objects';
import { registerStoredUpload } from './register';
import { recordSellerUpload } from './seller-uploads';
import { inRoomOrPackage, type SpaceTarget } from './targets';

export const beginUpload = refusableAction(
  async (input, user) => {
    const refusal = uploadRefusal(input);

    if (refusal) {
      throw new Refusal(refusal);
    }

    const space = await requireSpaceFolder(input, input.folderId, 'Files');

    const admin = getSupabaseServerAdminClient();
    const row = {
      deal_id: space.deal_id,
      folder_id: input.folderId,
      name: input.name,
      storage_path: dataRoomObjectPath(space.deal_id, input.name),
      uploaded_by: user.id,
    };
    const upload = space.sellerRoomId
      ? await admin
          .from('seller_upload')
          .insert({ ...row, room_id: space.sellerRoomId })
          .select('id, storage_path')
          .single()
          .throwOnError()
      : space.counselDealId || space.sellerCounselDealId
        ? await admin
            .from('counsel_upload')
            .insert(row)
            .select('id, storage_path')
            .single()
            .throwOnError()
        : await admin
            .from('lender_upload')
            .insert({ ...row, room_id: space.roomId })
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
    const upload = await findUpload(admin, input.uploadId);

    if (upload?.uploaded_by !== user.id) {
      throw new Refusal('That upload was not found');
    }

    const space = await requireSpace(upload.target);

    if (upload.document_ids) {
      return upload.document_ids;
    }

    const documentIds = await registerStoredUpload(
      admin,
      space,
      upload,
      input.keepAsZip,
    );

    if (space.sellerRoomId) {
      await recordSellerUpload(admin, space, user.id, upload.name, documentIds);
    }

    if (space.counselDealId) {
      await queueCounselUpload(admin, space, user.id, upload.name);
    }

    return documentIds;
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
    const upload = await findUpload(admin, input.uploadId);

    if (upload?.uploaded_by !== user.id) {
      throw new Refusal('That upload was not found');
    }

    if (upload.registered_at) {
      throw new Refusal('That file has already been added');
    }

    await removeObject(admin, upload.storage_path);
    await admin
      .from(upload.ledger)
      .delete()
      .eq('id', input.uploadId)
      .throwOnError();
  },
  { schema: z.object({ uploadId: z.uuid() }) },
);

async function findUpload(admin: Admin, uploadId: string) {
  const [lender, seller, counsel] = await Promise.all([
    admin
      .from('lender_upload')
      .select('*')
      .eq('id', uploadId)
      .maybeSingle()
      .throwOnError(),
    admin
      .from('seller_upload')
      .select('*')
      .eq('id', uploadId)
      .maybeSingle()
      .throwOnError(),
    admin
      .from('counsel_upload')
      .select('*')
      .eq('id', uploadId)
      .maybeSingle()
      .throwOnError(),
  ]);

  if (lender.data) {
    const target: SpaceTarget = lender.data.room_id
      ? { roomId: lender.data.room_id }
      : { dealId: lender.data.deal_id };

    return { ...lender.data, ledger: 'lender_upload' as const, target };
  }

  if (seller.data) {
    const target: SpaceTarget = { sellerRoomId: seller.data.room_id };

    return { ...seller.data, ledger: 'seller_upload' as const, target };
  }

  if (counsel.data) {
    const target: SpaceTarget = (await isInSellerCounselFolder(
      admin,
      counsel.data,
    ))
      ? { sellerCounselDealId: counsel.data.deal_id }
      : { counselDealId: counsel.data.deal_id };

    return { ...counsel.data, ledger: 'counsel_upload' as const, target };
  }

  return null;
}

async function isInSellerCounselFolder(
  admin: Admin,
  upload: { deal_id: string; folder_id: string },
): Promise<boolean> {
  const { data: sellerCounsel } = await admin
    .from('seller_counsel_folder')
    .select('folder_id')
    .eq('deal_id', upload.deal_id)
    .maybeSingle()
    .throwOnError();

  return (
    sellerCounsel !== null &&
    (await isWithinFolder(
      upload.deal_id,
      upload.folder_id,
      sellerCounsel.folder_id,
    ))
  );
}
