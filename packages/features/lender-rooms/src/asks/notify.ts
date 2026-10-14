import type { SupabaseClient } from '@supabase/supabase-js';

import {
  createNovuClient,
  triggerNotification,
} from '@odb/notifications/server';
import { getLogger } from '@odb/shared/logger';
import type { Database } from '@odb/supabase';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

type Admin = SupabaseClient<Database>;
type Payload = Record<string, unknown>;

async function notify(
  eventType: string,
  target: { roomId: string; payload: Payload },
  loadRecipientUserIds: (admin: Admin) => Promise<string[]>,
) {
  if (!process.env.NOVU_API_KEY || !process.env.NOVU_API_URL) {
    return;
  }

  try {
    await trigger(eventType, target.payload, loadRecipientUserIds);
  } catch (error) {
    getLogger().error(
      { err: error, eventType, roomId: target.roomId },
      'Lender room notification failed',
    );
  }
}

async function trigger(
  eventType: string,
  payload: Payload,
  loadRecipientUserIds: (admin: Admin) => Promise<string[]>,
) {
  const admin = getSupabaseServerAdminClient();
  const novu = createNovuClient();
  const recipientUserIds = [...new Set(await loadRecipientUserIds(admin))];

  const { data: personalAccounts } = await admin
    .from('accounts')
    .select('primary_owner_user_id, email')
    .eq('is_personal_account', true)
    .in('primary_owner_user_id', recipientUserIds)
    .throwOnError();

  const emailOf = new Map(
    personalAccounts.map((account) => [
      account.primary_owner_user_id,
      account.email,
    ]),
  );

  await Promise.all(
    recipientUserIds.map((recipientUserId) =>
      triggerNotification(
        { novu, client: admin },
        {
          eventType,
          recipientUserId,
          payload,
          email: emailOf.get(recipientUserId) ?? undefined,
        },
      ),
    ),
  );
}

export function notifyOurTeam(
  eventType: string,
  target: { roomId: string; accountId: string; payload: Payload },
) {
  return notify(eventType, target, async (admin) => {
    const { data: account } = await admin
      .from('accounts')
      .select('primary_owner_user_id')
      .eq('id', target.accountId)
      .single()
      .throwOnError();

    const { data: members } = await admin
      .from('accounts_memberships')
      .select('user_id')
      .eq('account_id', target.accountId)
      .throwOnError();

    return [
      account.primary_owner_user_id,
      ...members.map((member) => member.user_id),
    ];
  });
}

export function notifyRoomMembers(
  eventType: string,
  target: { roomId: string; payload: Payload },
) {
  return notify(eventType, target, async (admin) => {
    const { data: room } = await admin
      .from('lender_room')
      .select('closed_at, expires_at')
      .eq('id', target.roomId)
      .single()
      .throwOnError();

    const isOpen =
      room.closed_at === null &&
      (room.expires_at === null || Date.parse(room.expires_at) > Date.now());

    if (!isOpen) {
      return [];
    }

    const { data: members } = await admin
      .from('lender_room_member')
      .select('user_id')
      .eq('room_id', target.roomId)
      .throwOnError();

    return members.map((member) => member.user_id);
  });
}
