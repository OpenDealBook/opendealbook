'use server';

import { z } from 'zod';

import { refusableAction } from '@odb/lender-rooms/actions/refusable-action.ts';
import { Refusal } from '@odb/lender-rooms/actions/refusal.ts';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { recordSellerRoomVisit } from './listing';

async function recordAsMember(roomId: string, folderId: string | null) {
  const client = getSupabaseServerClient();

  const { data: member } = await client
    .rpc('is_seller_room_member', { room_id: roomId })
    .throwOnError();

  if (!member) {
    throw new Refusal('You do not have access to this room');
  }

  await recordSellerRoomVisit(
    client,
    getSupabaseServerAdminClient(),
    roomId,
    folderId,
  );
}

export const recordSellerRoomOpened = refusableAction(
  async (input) => recordAsMember(input.roomId, null),
  { auth: true, schema: z.object({ roomId: z.uuid() }) },
);

export const recordSellerFolderOpened = refusableAction(
  async (input) => {
    if (input.folderId !== input.roomId) {
      await recordAsMember(input.roomId, input.folderId);
    }
  },
  {
    auth: true,
    schema: z.object({ roomId: z.uuid(), folderId: z.uuid() }),
  },
);
