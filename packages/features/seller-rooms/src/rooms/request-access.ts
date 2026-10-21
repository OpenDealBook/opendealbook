'use server';

import { z } from 'zod';

import { refusableAction } from '@odb/lender-rooms/actions/refusable-action.ts';
import { Refusal } from '@odb/lender-rooms/actions/refusal.ts';
import { SELLER_ROOM_ACCESS_REQUESTED_WORKFLOW_ID } from '@odb/notifications/relay';
import {
  createNovuClient,
  triggerNotification,
} from '@odb/notifications/server';
import { getLogger } from '@odb/shared/logger';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { loadClosedSellerRoom } from './closed-room';

const DAY_SECONDS = 24 * 60 * 60;

export const requestSellerRoomAccess = refusableAction(
  async (input, user) => {
    const { data: room } = await getSupabaseServerClient()
      .rpc('my_seller_rooms')
      .eq('id', input.roomId)
      .maybeSingle()
      .throwOnError();

    if (!room) {
      throw new Refusal('You are not a member of this room');
    }

    if (room.is_open) {
      throw new Refusal('This room is open');
    }

    const admin = getSupabaseServerAdminClient();
    const { isDealArchived } = await loadClosedSellerRoom(admin, input.roomId);

    if (isDealArchived) {
      throw new Refusal('This room cannot be reopened right now');
    }

    const { data: firstToday } = await admin
      .rpc('lender_rate_limit_pass', {
        key: `seller-access:${input.roomId}:${user.id}`,
        window_seconds: DAY_SECONDS,
      })
      .throwOnError();

    if (!firstToday || !process.env.NOVU_API_KEY || !process.env.NOVU_API_URL) {
      return;
    }

    // Service role: a seller cannot read the team, its people, or the deal.
    // The caller was verified above as a member of this room.
    const { data: placed } = await admin
      .from('seller_room')
      .select(
        'deal_id, deal(firm!inner(name)), accounts(slug, primary_owner_user_id, accounts_memberships(user_id))',
      )
      .eq('id', input.roomId)
      .single()
      .throwOnError();
    const teamUserIds = [
      ...new Set([
        placed.accounts.primary_owner_user_id,
        ...placed.accounts.accounts_memberships.map((m) => m.user_id),
      ]),
    ];
    const { data: recipients } = await admin
      .from('accounts')
      .select('primary_owner_user_id, email')
      .eq('is_personal_account', true)
      .in('primary_owner_user_id', teamUserIds)
      .throwOnError();
    const novu = createNovuClient();

    // A Novu outage must not fail the seller's request, as for lenders.
    try {
      for (const recipient of recipients) {
        await triggerNotification(
          { novu, client: admin },
          {
            eventType: SELLER_ROOM_ACCESS_REQUESTED_WORKFLOW_ID,
            recipientUserId: recipient.primary_owner_user_id,
            email: recipient.email ?? undefined,
            payload: {
              email: user.email,
              dealName: placed.deal.firm.name,
              dealPath: `/home/${placed.accounts.slug}/deals/${placed.deal_id}`,
            },
          },
        );
      }
    } catch (error) {
      getLogger().error(
        { err: error, roomId: input.roomId },
        'Seller room access request notification failed',
      );
    }
  },
  { auth: true, schema: z.object({ roomId: z.uuid() }) },
);
