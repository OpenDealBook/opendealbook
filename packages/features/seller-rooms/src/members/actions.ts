'use server';

import { z } from 'zod';

import { refusableAction } from '@odb/lender-rooms/actions/refusable-action.ts';
import { Refusal } from '@odb/lender-rooms/actions/refusal.ts';
import { refuseAnotherSide } from '@odb/lender-rooms/members/another-side.ts';
import { getLogger } from '@odb/shared/logger';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { ensureManagedRoom } from '../rooms/room-guard';
import {
  SELLER_SIGN_IN_WINDOW_SECONDS,
  sellerSignInRateKey,
} from './entry-rules';
import { findOrCreateSeller } from './find-or-create-seller';
import { emailRemovedSeller, sendSellerRoomInvite } from './invite-email';

const ROOM_MEMBER_LIMIT = 25;
const DAILY_INVITE_LIMIT = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export const inviteSeller = refusableAction(
  async (input, user) => {
    const from = process.env.SELLER_DELIVERY_FROM_EMAIL;

    if (!from) {
      throw new Refusal('Seller email is not set up');
    }

    const client = getSupabaseServerClient();

    const roomId = await ensureManagedRoom(
      client,
      input.dealId,
      'You cannot invite sellers to this deal.',
    );

    const admin = getSupabaseServerAdminClient();

    await refuseAnotherSide(admin, {
      dealId: input.dealId,
      email: input.email,
      side: 'seller',
    });

    const { data: alreadyInRoom } = await client
      .from('seller_room_member')
      .select('id')
      .eq('room_id', roomId)
      .eq('email', input.email)
      .maybeSingle()
      .throwOnError();

    if (!alreadyInRoom) {
      await refuseOverCaps(client, roomId, user.id);

      await client
        .from('seller_room_member')
        .upsert(
          {
            room_id: roomId,
            user_id: await findOrCreateSeller(admin, input.email),
            email: input.email,
            name: input.name,
            invited_by: user.id,
          },
          { onConflict: 'room_id,user_id', ignoreDuplicates: true },
        )
        .throwOnError();
    }

    const { data: windowPassed } = await admin
      .rpc('lender_rate_limit_pass', {
        key: sellerSignInRateKey(input.email),
        window_seconds: SELLER_SIGN_IN_WINDOW_SECONDS,
      })
      .throwOnError();

    if (alreadyInRoom && !windowPassed) {
      throw new Refusal(
        'A sign-in link was sent to this address in the last 2 minutes. Try again shortly.',
      );
    }

    try {
      await sendSellerRoomInvite(admin, {
        email: input.email,
        roomId,
        dealId: input.dealId,
        sentBy: user.id,
        from,
      });
    } catch (sendError) {
      getLogger().error(
        { err: sendError },
        'Seller room invite email was not sent',
      );

      throw new Refusal(
        'The invite was saved but the email could not be sent. Send it again.',
      );
    }
  },
  {
    auth: true,
    schema: z.object({
      dealId: z.uuid(),
      name: z.string().trim().min(1).max(200),
      email: z.email().toLowerCase(),
    }),
  },
);

async function refuseOverCaps(
  client: ReturnType<typeof getSupabaseServerClient>,
  roomId: string,
  inviterId: string,
): Promise<void> {
  const { count: roomMembers } = await client
    .from('seller_room_member')
    .select('id', { count: 'exact', head: true })
    .eq('room_id', roomId)
    .throwOnError();

  if ((roomMembers ?? 0) >= ROOM_MEMBER_LIMIT) {
    throw new Refusal(
      `This room already has ${ROOM_MEMBER_LIMIT} people, the most it can hold.`,
    );
  }

  const { count: recentInvites } = await client
    .from('seller_room_member')
    .select('id', { count: 'exact', head: true })
    .eq('invited_by', inviterId)
    .gte('created_at', new Date(Date.now() - DAY_MS).toISOString())
    .throwOnError();

  if ((recentInvites ?? 0) >= DAILY_INVITE_LIMIT) {
    throw new Refusal(
      `You have invited ${DAILY_INVITE_LIMIT} people in the last 24 hours. Try again later.`,
    );
  }
}

export const removeSeller = refusableAction(
  async (input, user) => {
    const from = process.env.SELLER_DELIVERY_FROM_EMAIL;

    if (!from) {
      throw new Refusal('Seller email is not set up');
    }

    const client = getSupabaseServerClient();
    const roomId = await ensureManagedRoom(
      client,
      input.dealId,
      'You cannot change this seller room.',
    );

    const { data: removed } = await client
      .from('seller_room_member')
      .delete()
      .eq('id', input.memberId)
      .eq('room_id', roomId)
      .select('email')
      .throwOnError();

    if (removed.length === 0) {
      throw new Refusal('That person is not in this room.');
    }

    // Service role: reads the remover's account and the deal's names for the
    // email. The caller was proven above to manage this room.
    await emailRemovedSeller(getSupabaseServerAdminClient(), {
      email: removed[0]!.email,
      dealId: input.dealId,
      sentBy: user.id,
      from,
    });
  },
  {
    auth: true,
    schema: z.object({ dealId: z.uuid(), memberId: z.uuid() }),
  },
);
