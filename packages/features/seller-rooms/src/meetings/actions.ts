'use server';

import { z } from 'zod';

import { refusableAction } from '@odb/lender-rooms/actions/refusable-action.ts';
import { Refusal } from '@odb/lender-rooms/actions/refusal.ts';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { queueForSellerDigest } from '../rooms/room-digest';
import { ensureManagedRoom } from '../rooms/room-guard';

const NOT_ALLOWED = 'You cannot change this seller room.';

const meetingInput = z.object({ dealId: z.uuid(), meetingId: z.uuid() });

export const shareSellerRoomMeeting = refusableAction(
  async (input) => {
    const client = getSupabaseServerClient();
    const roomId = await ensureManagedRoom(client, input.dealId, NOT_ALLOWED);

    const { data: meeting } = await client
      .from('meeting')
      .select('id')
      .eq('id', input.meetingId)
      .eq('deal_id', input.dealId)
      .maybeSingle()
      .throwOnError();

    if (!meeting) {
      throw new Refusal('That meeting is not in this deal.');
    }

    await client
      .from('seller_room_meeting')
      .upsert(
        { room_id: roomId, meeting_id: input.meetingId },
        { onConflict: 'room_id,meeting_id', ignoreDuplicates: true },
      )
      .throwOnError();

    await queueForSellerDigest(getSupabaseServerAdminClient(), {
      kind: 'meeting',
      roomId,
      meetingId: input.meetingId,
    });
  },
  { auth: true, schema: meetingInput },
);

export const unshareSellerRoomMeeting = refusableAction(
  async (input) => {
    const client = getSupabaseServerClient();
    const roomId = await ensureManagedRoom(client, input.dealId, NOT_ALLOWED);

    await client
      .from('seller_room_meeting')
      .delete()
      .eq('room_id', roomId)
      .eq('meeting_id', input.meetingId)
      .throwOnError();
  },
  { auth: true, schema: meetingInput },
);
