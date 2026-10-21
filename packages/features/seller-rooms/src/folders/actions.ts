'use server';

import { z } from 'zod';

import { refusableAction } from '@odb/lender-rooms/actions/refusable-action.ts';
import { Refusal } from '@odb/lender-rooms/actions/refusal.ts';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { queueForSellerDigest } from '../rooms/room-digest';
import { ensureManagedRoom } from '../rooms/room-guard';

const NOT_ALLOWED = 'You cannot change this seller room.';
const COUNSEL_FOLDER = '23001';

const folderInput = z.object({ dealId: z.uuid(), folderId: z.uuid() });

export const showSellerRoomFolder = refusableAction(
  async (input) => {
    const client = getSupabaseServerClient();
    const roomId = await ensureManagedRoom(client, input.dealId, NOT_ALLOWED);

    const { data: folder } = await client
      .from('dr_folder')
      .select('id')
      .eq('id', input.folderId)
      .eq('deal_id', input.dealId)
      .maybeSingle()
      .throwOnError();

    if (!folder) {
      throw new Refusal('That folder is not in this deal.');
    }

    const { data: isLenderFolder } = await client
      .rpc('is_lender_folder', { folder_id: input.folderId })
      .throwOnError();

    if (isLenderFolder) {
      throw new Refusal('Lender folders cannot be shown to sellers.');
    }

    const { error } = await client
      .from('seller_room_folder')
      .upsert(
        { room_id: roomId, dr_folder_id: input.folderId },
        { onConflict: 'room_id,dr_folder_id', ignoreDuplicates: true },
      );

    if (error?.code === COUNSEL_FOLDER) {
      throw new Refusal(error.message);
    }

    if (error) {
      throw error;
    }

    await queueForSellerDigest(getSupabaseServerAdminClient(), {
      kind: 'folder',
      roomId,
      folderId: input.folderId,
    });
  },
  { auth: true, schema: folderInput },
);

export const hideSellerRoomFolder = refusableAction(
  async (input) => {
    const client = getSupabaseServerClient();
    const roomId = await ensureManagedRoom(client, input.dealId, NOT_ALLOWED);

    await client
      .from('seller_room_folder')
      .delete()
      .eq('room_id', roomId)
      .eq('dr_folder_id', input.folderId)
      .throwOnError();
  },
  { auth: true, schema: folderInput },
);
