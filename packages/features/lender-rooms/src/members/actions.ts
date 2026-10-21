'use server';

import { after } from 'next/server';

import type { SupabaseClient } from '@supabase/supabase-js';

import { z } from 'zod';

import { getLogger } from '@odb/shared/logger';
import type { Database } from '@odb/supabase';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { refusableAction } from '../actions/refusable-action';
import { Refusal } from '../actions/refusal';
import { notifyOurTeam } from '../asks/notify';
import { refuseAnotherSide } from './another-side';
import { safeNextPath } from './entry-rules';
import { findOrCreateUserId } from './find-or-create-user-id';
import { giveNameIfNone } from './give-name-if-none';
import { lenderNames } from './person-name';
import {
  claimSignInLinkWindow,
  sendLenderInvite,
  sendSignInLink,
} from './sign-in-link';

const ROOM_MEMBER_LIMIT = 25;
const DAILY_INVITE_LIMIT = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export const inviteLenderMember = refusableAction(
  async (input, user) => {
    const client = getSupabaseServerClient();

    const { data: mayInvite } = await client
      .rpc('can_manage_lender_room', { room_id: input.roomId })
      .throwOnError();

    if (!mayInvite) {
      throw new Refusal('You cannot invite people to this room');
    }

    const admin = getSupabaseServerAdminClient();

    const { data: room } = await client
      .from('lender_room')
      .select('deal_id')
      .eq('id', input.roomId)
      .single()
      .throwOnError();

    await refuseAnotherSide(admin, {
      dealId: room.deal_id,
      email: input.email,
      side: 'lender',
    });

    const { data: roomMembers } = await client
      .from('lender_room_member')
      .select('email, user_id')
      .eq('room_id', input.roomId)
      .throwOnError();

    const memberAlready = roomMembers.find(
      (member) => member.email === input.email,
    );
    const alreadyInRoom = Boolean(memberAlready);

    let userId = memberAlready?.user_id;

    if (!userId) {
      if (roomMembers.length >= ROOM_MEMBER_LIMIT) {
        throw new Refusal(
          `This room already has ${ROOM_MEMBER_LIMIT} people, the most it can hold.`,
        );
      }

      const { data: recentInvites } = await client
        .from('lender_room_member')
        .select('id')
        .eq('invited_by', user.id)
        .gte('created_at', new Date(Date.now() - DAY_MS).toISOString())
        .throwOnError();

      if (recentInvites.length >= DAILY_INVITE_LIMIT) {
        throw new Refusal(
          `You have invited ${DAILY_INVITE_LIMIT} people in the last 24 hours. Try again later.`,
        );
      }

      userId = await findOrCreateUserId(admin, input.email);

      await client
        .from('lender_room_member')
        .upsert(
          {
            room_id: input.roomId,
            user_id: userId,
            email: input.email,
            invited_by: user.id,
          },
          { onConflict: 'room_id,user_id', ignoreDuplicates: true },
        )
        .throwOnError();
    }

    if (input.name) {
      await giveNameIfNone(admin, userId, input.name);
    }

    const windowPassed = await claimSignInLinkWindow(admin, input.email);

    if (alreadyInRoom && !windowPassed) {
      throw new Refusal(
        'A sign-in link was sent to this address in the last 2 minutes. Try again shortly.',
      );
    }

    try {
      await sendLenderInvite(admin, {
        email: input.email,
        roomId: input.roomId,
        sentBy: user.id,
      });
    } catch (error) {
      getLogger().error({ err: error }, 'Lender invite email was not sent');

      throw new Refusal(
        'The invite was saved but the email could not be sent. Send it again.',
      );
    }
  },
  {
    auth: true,
    schema: z.object({
      roomId: z.uuid(),
      email: z.email().toLowerCase(),
      name: z.string().trim().optional(),
    }),
  },
);

export const removeLenderMember = refusableAction(
  async (input) => {
    const { data: removed } = await getSupabaseServerClient()
      .from('lender_room_member')
      .delete()
      .eq('id', input.memberId)
      .select('id')
      .throwOnError();

    if (removed.length === 0) {
      throw new Refusal('That person is not in this room');
    }
  },
  { auth: true, schema: z.object({ memberId: z.uuid() }) },
);

export const listLenderMembers = refusableAction(
  async (input) => {
    const { data } = await getSupabaseServerClient()
      .from('lender_room_member')
      .select('*')
      .eq('room_id', input.roomId)
      .order('created_at', { ascending: true })
      .throwOnError();

    const names = await lenderNames(
      getSupabaseServerClient(),
      data.map((member) => member.user_id),
    );

    // Service role: sign-in times live in auth, which no signed-in user can
    // read. Only people the caller could already see above are looked up, and
    // only whether they have ever signed in leaves the server.
    const admin = getSupabaseServerAdminClient();
    const signedIn = await Promise.all(
      data.map(async (member) => {
        const { data: found, error } = await admin.auth.admin.getUserById(
          member.user_id,
        );

        if (error) {
          throw error;
        }

        return Boolean(found.user.last_sign_in_at);
      }),
    );

    return data.map((member, index) => ({
      ...member,
      name: names.get(member.user_id) ?? null,
      has_signed_in: signedIn[index]!,
    }));
  },
  { auth: true, schema: z.object({ roomId: z.uuid() }) },
);

export const requestLenderRoomAccess = refusableAction(
  async (input, user) => {
    const { data: room } = await getSupabaseServerClient()
      .rpc('lender_room_view', { room_id: input.roomId })
      .maybeSingle()
      .throwOnError();

    if (!room) {
      throw new Refusal('You are not a member of this room');
    }

    if (room.is_open) {
      throw new Refusal('This room is open');
    }

    const admin = getSupabaseServerAdminClient();

    const { data: firstToday } = await admin
      .rpc('lender_rate_limit_pass', {
        key: `access:${input.roomId}:${user.id}`,
        window_seconds: DAY_MS / 1000,
      })
      .throwOnError();

    // A repeat inside 24 hours is accepted without telling the team again, so
    // the lender sees the same confirmation and the team is not flooded.
    if (!firstToday) {
      return;
    }

    // Service role: a lender cannot read the room's account.
    // The caller was verified above as a member of this room.
    const { data: roomAccount } = await admin
      .from('lender_room')
      .select('account_id')
      .eq('id', input.roomId)
      .single()
      .throwOnError();

    await notifyOurTeam({
      eventType: 'lender_room.access_requested',
      accountId: roomAccount.account_id,
      eventKey: `${input.roomId}:${user.id}:${new Date().toISOString().slice(0, 10)}`,
      payload: { roomId: input.roomId, email: z.string().parse(user.email) },
    });
  },
  { auth: true, schema: z.object({ roomId: z.uuid() }) },
);

export const requestLenderSignInLink = refusableAction(
  async (input) => {
    // Everything happens after the response so that timing and outcome are the
    // same whether or not the address belongs to anyone.
    after(async () => {
      try {
        const admin = getSupabaseServerAdminClient();

        const { data: memberships } = await admin
          .from('lender_room_member')
          .select('id')
          .eq('email', input.email)
          .limit(1)
          .throwOnError();

        // Silent: an address in no lender room gets no email and no hint.
        if (memberships.length === 0) {
          return;
        }

        // Silent: a second request inside two minutes is dropped.
        if (!(await claimSignInLinkWindow(admin, input.email))) {
          return;
        }

        await sendSignInLink(admin, input);
      } catch (error) {
        getLogger().error({ err: error }, 'Lender sign-in link was not sent');
      }
    });
  },
  {
    auth: false,
    schema: z.object({
      email: z.email().toLowerCase(),
      next: z.string().transform(safeNextPath),
    }),
  },
);

export const listRemovedLenderMembers = refusableAction(
  async (input) => {
    const client = getSupabaseServerClient();

    const { data: onDealTeam } = await client
      .rpc('can_manage_lender_room', { room_id: input.roomId })
      .throwOnError();

    if (!onDealTeam) {
      throw new Refusal('Only the deal team can do that');
    }

    const { data: current } = await client
      .from('lender_room_member')
      .select('user_id')
      .eq('room_id', input.roomId)
      .throwOnError();

    const { data: removals } = await client
      .from('lender_room_removed_member')
      .select('user_id, email, invited_at, removed_at')
      .eq('room_id', input.roomId)
      .order('removed_at', { ascending: false })
      .throwOnError();

    const listed = new Set(current.map((member) => member.user_id));
    const names = await lenderNames(
      client,
      removals.map((removal) => removal.user_id),
    );

    return removals.flatMap((removal) => {
      if (listed.has(removal.user_id)) {
        return [];
      }

      listed.add(removal.user_id);

      return [
        {
          userId: removal.user_id,
          email: removal.email,
          name: names.get(removal.user_id) ?? null,
          invitedAt: removal.invited_at,
          removedAt: removal.removed_at,
        },
      ];
    });
  },
  { auth: true, schema: z.object({ roomId: z.uuid() }) },
);

// Service role for both: a person writes only their own row, keyed by the
// session's user id, and lenders have no write grant on the table.
async function recordPhoneAnswer(
  userId: string,
  phone: { phone: string | null } | Record<string, never>,
) {
  await getSupabaseServerAdminClient()
    .from('accounts')
    .update({ ...phone, phone_asked_at: new Date().toISOString() })
    .eq('id', userId)
    .throwOnError();
}

export const setMyLenderName = refusableAction(
  async (input, user) => {
    await getSupabaseServerAdminClient()
      .from('lender_person')
      .upsert({
        user_id: user.id,
        name: input.name,
        name_asked_at: new Date().toISOString(),
      })
      .throwOnError();

    if (input.phone !== undefined) {
      await recordPhoneAnswer(user.id, { phone: input.phone });
    }
  },
  {
    auth: true,
    schema: z.object({
      name: z.string().trim().min(1),
      phone: z
        .string()
        .trim()
        .max(50)
        .transform((phone) => phone || null)
        .optional(),
    }),
  },
);

export const skipLenderNamePrompt = refusableAction(
  async (_input, user) => {
    await getSupabaseServerAdminClient()
      .from('lender_person')
      .upsert({
        user_id: user.id,
        name_asked_at: new Date().toISOString(),
      })
      .throwOnError();
    await recordPhoneAnswer(user.id, {});
  },
  { auth: true, schema: z.object({}) },
);
