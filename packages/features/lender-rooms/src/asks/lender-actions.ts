'use server';

import { z } from 'zod';

import type { Tables } from '@odb/supabase';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { refusableAction } from '../actions/refusable-action';
import { Refusal } from '../actions/refusal';
import { recordActivity } from '../activity/record-activity';
import { notifyOurTeam } from './notify';
import { replySchemaFor } from './reply-schema';
import {
  assertRoomMember,
  assertRoomShowsDocuments,
  saveLenderMove,
} from './room-checks';

type LoadedAsk = Pick<
  Tables<'lender_ask'>,
  'id' | 'room_id' | 'account_id' | 'status' | 'first_response_at'
>;

async function attachDocuments(
  askId: string,
  userId: string,
  documentIds: string[],
) {
  const { data: files } = await getSupabaseServerAdminClient()
    .from('lender_ask_file')
    .insert(
      documentIds.map((documentId) => ({
        ask_id: askId,
        dr_document_id: documentId,
        role: 'attachment' as const,
        added_by: userId,
      })),
    )
    .select('id')
    .throwOnError();

  return files.map((file) => file.id);
}

async function loadAskAsRoomMember(askId: string): Promise<LoadedAsk> {
  const { data: ask } = await getSupabaseServerAdminClient()
    .from('lender_ask')
    .select('id, room_id, account_id, status, first_response_at')
    .eq('id', askId)
    .eq('kind', 'ask')
    .maybeSingle()
    .throwOnError();

  if (ask) {
    const { data: isMember } = await getSupabaseServerClient()
      .rpc('is_lender_room_member', { room_id: ask.room_id })
      .throwOnError();

    if (isMember) {
      return ask;
    }
  }

  throw new Refusal('That request was not found');
}

const wordingSchema = {
  title: z.string().trim().min(1, 'An ask needs a title'),
  body: z.string().min(1).optional(),
};

const openAskSchema = z.object({
  roomId: z.uuid(),
  ...wordingSchema,
  documentIds: z.array(z.uuid()).optional(),
  afterSuggestion: z.boolean().optional(),
});

export const openAsk = refusableAction(
  async (input, user) => {
    const documentIds = input.documentIds ?? [];

    await assertRoomMember(input.roomId);
    await assertRoomShowsDocuments(input.roomId, documentIds);

    const admin = getSupabaseServerAdminClient();

    const { data: room } = await admin
      .from('lender_room')
      .select('account_id')
      .eq('id', input.roomId)
      .single()
      .throwOnError();

    const { data: ask } = await admin
      .from('lender_ask')
      .insert({
        room_id: input.roomId,
        account_id: room.account_id,
        kind: 'ask',
        title: input.title,
        body: input.body,
        created_by: user.id,
      })
      .select('id')
      .single()
      .throwOnError();

    await attachDocuments(ask.id, user.id, documentIds);

    if (input.afterSuggestion) {
      await recordActivity({
        client: getSupabaseServerClient(),
        admin,
        roomId: input.roomId,
        action: 'request_sent_after_suggestion',
        payload: { askId: ask.id },
      });
    }

    await notifyOurTeam({
      eventType: 'lender_ask.opened',
      accountId: room.account_id,
      eventKey: ask.id,
      payload: { roomId: input.roomId, askId: ask.id, kind: 'ask' },
    });

    return ask.id;
  },
  { auth: true, schema: openAskSchema },
);

const editAskSchema = z.object({ askId: z.uuid(), ...wordingSchema });

export const editAsk = refusableAction(
  async (input) => {
    const ask = await loadAskAsRoomMember(input.askId);

    await saveLenderMove(ask, 'edit', {
      title: input.title,
      body: input.body ?? null,
    });
  },
  { auth: true, schema: editAskSchema },
);

const askIdSchema = z.object({ askId: z.uuid() });

export const withdrawAsk = refusableAction(
  async (input) => {
    await saveLenderMove(await loadAskAsRoomMember(input.askId), 'withdraw');
  },
  { auth: true, schema: askIdSchema },
);

export const replyToAskAsLender = refusableAction(
  async (input, user) => {
    const documentIds = input.documentIds ?? [];
    const ask = await loadAskAsRoomMember(input.askId);

    await assertRoomShowsDocuments(ask.room_id, documentIds);
    await saveLenderMove(ask, 'reply');

    const message = input.body
      ? (
          await getSupabaseServerAdminClient()
            .from('lender_ask_message')
            .insert({
              ask_id: ask.id,
              author_user_id: user.id,
              side: 'lender',
              body: input.body,
            })
            .select('id')
            .single()
            .throwOnError()
        ).data
      : null;

    const fileIds = await attachDocuments(ask.id, user.id, documentIds);

    await notifyOurTeam({
      eventType: 'lender_ask.replied',
      accountId: ask.account_id,
      eventKey: message?.id ?? fileIds[0]!,
      payload: { roomId: ask.room_id, askId: ask.id, kind: 'ask' },
    });
  },
  { auth: true, schema: replySchemaFor('askId') },
);

export const closeAskAsLender = refusableAction(
  async (input) => {
    await saveLenderMove(await loadAskAsRoomMember(input.askId), 'close');
  },
  { auth: true, schema: askIdSchema },
);
