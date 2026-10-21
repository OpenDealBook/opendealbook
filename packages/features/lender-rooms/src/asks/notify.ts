import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { dealPath, teamItemPath } from '@odb/notifications/relay';
import {
  createNovuClient,
  triggerNotification,
} from '@odb/notifications/server';
import { getLogger } from '@odb/shared/logger';
import type { Database } from '@odb/supabase';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

type Admin = SupabaseClient<Database>;
type Payload = Record<string, unknown>;

type SignatureOutcome = 'completed' | 'declined' | 'expired';

type TeamNotice = { accountId: string; eventKey: string } & (
  | {
      eventType: 'lender_ask.opened' | 'lender_ask.replied' | 'lender_form.uploaded';
      payload: { roomId: string; askId: string; kind: 'ask' | 'form' };
    }
  | {
      eventType: 'lender_room.timeline_answered';
      payload: { roomId: string; answer: string };
    }
  | {
      eventType: 'lender_room.access_requested';
      payload: { roomId: string; email: string };
    }
  | {
      eventType: `lender_form.signature_${SignatureOutcome}`;
      payload: { roomId: string; askId: string; audience: 'team' };
    }
);

function isNovuConfigured() {
  return Boolean(process.env.NOVU_API_KEY && process.env.NOVU_API_URL);
}

async function safely(
  eventType: string,
  roomId: string,
  send: () => Promise<void>,
) {
  try {
    await send();
  } catch (error) {
    getLogger().error(
      { err: error, eventType, roomId },
      'Lender room notification failed',
    );
  }
}

async function trigger(
  admin: Admin,
  eventType: string,
  payload: Payload,
  recipientUserIds: string[],
) {
  const novu = createNovuClient();

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

export async function ourTeamIds(admin: Admin, accountId: string) {
  const { data: account } = await admin
    .from('accounts')
    .select('primary_owner_user_id')
    .eq('id', accountId)
    .single()
    .throwOnError();

  const { data: members } = await admin
    .from('accounts_memberships')
    .select('user_id')
    .eq('account_id', accountId)
    .throwOnError();

  return [
    ...new Set([
      account.primary_owner_user_id,
      ...members.map((member) => member.user_id),
    ]),
  ];
}

async function ringOurBell(
  admin: Admin,
  notice: TeamNotice,
  recipientUserIds: string[],
) {
  const { data: room } = await admin
    .from('lender_room')
    .select('name, deal_id, deal(firm!inner(name)), accounts(slug)')
    .eq('id', notice.payload.roomId)
    .single()
    .throwOnError();

  const slug = z.string().parse(room.accounts.slug);
  const lender = room.name;
  const deal = room.deal.firm.name;
  const roomPage = `${dealPath(slug, room.deal_id)}/lenders/${notice.payload.roomId}`;
  const thread = (kind: 'ask' | 'form', askId: string) =>
    `${roomPage}/requests/${kind === 'ask' ? 'asks' : 'forms'}/${askId}`;

  const bell = (() => {
    switch (notice.eventType) {
      case 'lender_ask.opened':
        return {
          body: `${lender} made a new request on ${deal}`,
          link: thread(notice.payload.kind, notice.payload.askId),
        };
      case 'lender_ask.replied':
        return {
          body:
            notice.payload.kind === 'ask'
              ? `${lender} replied to a request on ${deal}`
              : `${lender} replied about a form on ${deal}`,
          link: thread(notice.payload.kind, notice.payload.askId),
        };
      case 'lender_form.uploaded':
        return {
          body: `${lender} uploaded a form to complete on ${deal}`,
          link: thread(notice.payload.kind, notice.payload.askId),
        };
      case 'lender_room.timeline_answered':
        return {
          body: `${lender} answered your closing timeline question on ${deal}`,
          link: teamItemPath(slug, room.deal_id, {
            kind: 'lender-timeline-answer',
            id: notice.payload.roomId,
          }),
        };
      case 'lender_room.access_requested':
        return {
          body: `${notice.payload.email} asked for access to ${lender}`,
          link: roomPage,
        };
      case 'lender_form.signature_completed':
        return {
          body: `A form for ${lender} was signed on ${deal}`,
          link: thread('form', notice.payload.askId),
        };
      case 'lender_form.signature_declined':
        return {
          body: `A form signature for ${lender} was declined on ${deal}`,
          link: thread('form', notice.payload.askId),
        };
      case 'lender_form.signature_expired':
        return {
          body: `A form signature for ${lender} expired on ${deal}`,
          link: thread('form', notice.payload.askId),
        };
    }
  })();

  await admin
    .from('notifications')
    .upsert(
      recipientUserIds.map((recipientUserId) => ({
        account_id: notice.accountId,
        recipient_user_id: recipientUserId,
        deal_id: room.deal_id,
        body: bell.body,
        link: bell.link,
        dedupe_key: `${notice.eventType}:${notice.eventKey}:${recipientUserId}`,
      })),
      { onConflict: 'dedupe_key', ignoreDuplicates: true },
    )
    .throwOnError();
}

export function notifyOurTeam(notice: TeamNotice) {
  return safely(notice.eventType, notice.payload.roomId, async () => {
    const admin = getSupabaseServerAdminClient();
    const recipientUserIds = await ourTeamIds(admin, notice.accountId);

    await ringOurBell(admin, notice, recipientUserIds);

    if (isNovuConfigured()) {
      await trigger(admin, notice.eventType, notice.payload, recipientUserIds);
    }
  });
}

export function notifyRoomMembers(
  eventType: string,
  target: { roomId: string; payload: Payload },
) {
  return safely(eventType, target.roomId, async () => {
    if (!isNovuConfigured()) {
      return;
    }

    const admin = getSupabaseServerAdminClient();
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
      return;
    }

    const { data: members } = await admin
      .from('lender_room_member')
      .select('user_id')
      .eq('room_id', target.roomId)
      .throwOnError();

    await trigger(
      admin,
      eventType,
      target.payload,
      [...new Set(members.map((member) => member.user_id))],
    );
  });
}
