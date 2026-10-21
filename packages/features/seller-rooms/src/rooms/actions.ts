'use server';

import { z } from 'zod';

import { refusableAction } from '@odb/lender-rooms/actions/refusable-action.ts';
import { Refusal } from '@odb/lender-rooms/actions/refusal.ts';
import {
  closeState,
  forgetRoomClosing,
  prepareRoomClose,
} from '@odb/lender-rooms/rooms/closing.ts';
import {
  SELLER_ROOM_CLOSED_WORKFLOW_ID,
  SELLER_ROOM_REOPENED_WORKFLOW_ID,
} from '@odb/notifications/relay';
import {
  createNovuClient,
  triggerNotification,
} from '@odb/notifications/server';
import { getLogger } from '@odb/shared/logger';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { sellerRoomPath } from '../members/entry-rules';
import { ensureManagedRoom } from './room-guard';

const NOT_ALLOWED = 'You cannot change this seller room.';

const dealInput = z.object({ dealId: z.uuid() });

const SELLER_CLOSING_TODO = 'Tell the seller/broker the room is closing';

async function setClosed(dealId: string, closed: boolean, userId: string) {
  const client = getSupabaseServerClient();
  const roomId = await ensureManagedRoom(client, dealId, NOT_ALLOWED);

  const { data: room } = await client
    .from('seller_room')
    .select(
      'closed_at, deal(archived_at, code_name, firm!inner(name)), accounts(name), seller_room_member(user_id, email)',
    )
    .eq('id', roomId)
    .single()
    .throwOnError();

  if (!closed && room.deal.archived_at !== null) {
    throw new Refusal('Unarchive the deal to reopen this room');
  }

  if (closed === (room.closed_at !== null)) {
    throw new Refusal(
      closed ? 'This room is already closed' : 'This room is already open',
    );
  }

  const admin = getSupabaseServerAdminClient();
  const closing = { kind: 'seller' as const, roomId };

  if (closed && !(await closeState(admin, closing, userId)).ready) {
    throw new Refusal('Tell the sellers or brokers the room is closing first');
  }

  await client
    .from('seller_room')
    .update({ closed_at: closed ? new Date().toISOString() : null })
    .eq('id', roomId)
    .throwOnError();

  if (closed) {
    await forgetRoomClosing(admin, closing);
  }

  if (!process.env.NOVU_API_KEY || !process.env.NOVU_API_URL) {
    return;
  }

  const novu = createNovuClient();
  const payload = {
    teamName: room.accounts.name,
    dealName: room.deal.firm.name,
    outsideName: room.deal.code_name ?? room.deal.firm.name,
    roomPath: sellerRoomPath(roomId),
  };

  // A Novu outage must not undo the team's close or reopen.
  try {
    for (const member of room.seller_room_member) {
      await triggerNotification(
        { novu, client: admin },
        {
          eventType: closed
            ? SELLER_ROOM_CLOSED_WORKFLOW_ID
            : SELLER_ROOM_REOPENED_WORKFLOW_ID,
          recipientUserId: member.user_id,
          email: member.email,
          payload,
        },
      );
    }
  } catch (error) {
    getLogger().error({ err: error, roomId }, 'Seller room notice failed');
  }
}

export const prepareSellerRoomClose = refusableAction(
  async (input, user) => {
    const client = getSupabaseServerClient();
    const roomId = await ensureManagedRoom(client, input.dealId, NOT_ALLOWED);
    const { data: room } = await client
      .from('seller_room')
      .select('account_id, closed_at')
      .eq('id', roomId)
      .single()
      .throwOnError();

    if (room.closed_at !== null) {
      throw new Refusal('This room is already closed');
    }

    await prepareRoomClose(
      getSupabaseServerAdminClient(),
      {
        kind: 'seller',
        roomId,
        accountId: room.account_id,
        dealId: input.dealId,
        title: SELLER_CLOSING_TODO,
      },
      user.id,
    );
  },
  { auth: true, schema: dealInput },
);

export const closeSellerRoom = refusableAction(
  (input, user) => setClosed(input.dealId, true, user.id),
  { auth: true, schema: dealInput },
);

export const reopenSellerRoom = refusableAction(
  (input, user) => setClosed(input.dealId, false, user.id),
  { auth: true, schema: dealInput },
);
