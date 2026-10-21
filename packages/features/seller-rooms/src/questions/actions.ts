'use server';

import type { SupabaseClient, User } from '@supabase/supabase-js';

import { z } from 'zod';

import {
  notifyDealManagers,
  queueSellerActivity,
} from '@odb/lender-rooms/actions/deal-managers.ts';
import { refusableAction } from '@odb/lender-rooms/actions/refusable-action.ts';
import { Refusal } from '@odb/lender-rooms/actions/refusal.ts';
import { forwardIntoAsk } from '@odb/lender-rooms/asks/team-reply.ts';
import { TEAM_READ_ONLY } from '@odb/next';
import { teamItemPath } from '@odb/notifications/relay';
import { getLogger } from '@odb/shared/logger';
import type { Database } from '@odb/supabase';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { managersOnlyRefusal } from '../members/people';
import { ensureManagedRoom } from '../rooms/room-guard';
import { emailSellersAboutQuestion } from './question-email';

const NOT_ALLOWED = 'You cannot ask in this seller room.';

async function roomToAskIn(
  client: ReturnType<typeof getSupabaseServerClient>,
  dealId: string,
): Promise<string> {
  const { data: roomId } = await client
    .rpc('seller_room_id_for_work', { deal_id: dealId })
    .throwOnError();

  if (roomId) {
    return roomId;
  }

  const refusal = await managersOnlyRefusal(
    client,
    getSupabaseServerAdminClient(),
    dealId,
    'open the seller room',
  );

  if (refusal) {
    throw new Refusal(refusal);
  }

  return ensureManagedRoom(client, dealId, NOT_ALLOWED);
}

async function refuseBeforeSellersJoin(
  client: ReturnType<typeof getSupabaseServerClient>,
  dealId: string,
): Promise<void> {
  const { data: sellers } = await client
    .rpc('seller_room_names', { deal_id: dealId })
    .throwOnError();

  if (sellers.length !== 0) {
    return;
  }

  const { data: people } = await client
    .rpc('deal_people', { deal_id: dealId })
    .throwOnError();

  const notJoined = people
    .filter((person) =>
      person.entries.some(
        (entry) => entry.side === 'seller' && entry.role === 'principal',
      ),
    )
    .map((person) => person.name)
    .toSorted();

  if (notJoined.length > 0) {
    throw new Refusal(
      `${notJoined.join(' and ')} ${notJoined.length === 1 ? "hasn't" : "haven't"} joined the seller room yet; invite them first.`,
    );
  }
}

interface SavedQuestion {
  id: string;
  email: () => Promise<void>;
}

async function saveQuestionInRoom(
  input: {
    dealId: string;
    title: string;
    body: string;
  },
  user: User,
): Promise<SavedQuestion> {
  const from = process.env.SELLER_DELIVERY_FROM_EMAIL;

  if (!from) {
    throw new Refusal('Seller email is not set up');
  }

  const client = getSupabaseServerClient();
  const { data: works } = await client
    .rpc('has_deal_permission', {
      deal_id: input.dealId,
      permission: 'deals.work',
    })
    .throwOnError();

  if (!works) {
    throw new Refusal(NOT_ALLOWED);
  }

  const { data: deal } = await client
    .from('deal')
    .select('account_id')
    .eq('id', input.dealId)
    .single()
    .throwOnError();

  const { data: locked } = await client
    .rpc('is_account_locked', { target_account_id: deal.account_id })
    .throwOnError();

  if (locked) {
    throw new Refusal(TEAM_READ_ONLY);
  }

  const roomId = await roomToAskIn(client, input.dealId);

  await refuseBeforeSellersJoin(client, input.dealId);

  const { data: asked } = await client
    .from('seller_room_question')
    .insert({
      room_id: roomId,
      account_id: deal.account_id,
      title: input.title,
      body: input.body || null,
    })
    .select('id')
    .single()
    .throwOnError();

  return {
    id: asked.id,
    email: () =>
      emailSellersAboutQuestion(getSupabaseServerAdminClient(), {
        roomId,
        title: input.title,
        from,
        askedBy: user.id,
      }),
  };
}

async function emailOrRefuse(
  question: SavedQuestion,
  refusal: string,
): Promise<string> {
  try {
    await question.email();
  } catch (error) {
    getLogger().error({ err: error }, 'Seller question email was not sent');

    throw new Refusal(refusal);
  }

  return question.id;
}

async function askInRoom(
  input: Parameters<typeof saveQuestionInRoom>[0],
  user: User,
): Promise<string> {
  return emailOrRefuse(
    await saveQuestionInRoom(input, user),
    'The question was asked, but the email to the sellers could not be sent.',
  );
}

const questionWording = {
  title: z.string().trim().min(1).max(300),
  body: z.string().trim().max(10_000),
};

export const askSeller = refusableAction(askInRoom, {
  auth: true,
  schema: z.object({ dealId: z.uuid(), ...questionWording }),
});

export const requestChecklistItemFromSeller = refusableAction(
  async (input, user): Promise<string> => {
    const client = getSupabaseServerClient();
    const { data: item } = await client
      .from('checklist_item')
      .select('deal_id')
      .eq('id', input.checklistItemId)
      .single()
      .throwOnError();

    const question = await saveQuestionInRoom(
      { dealId: item.deal_id, title: input.title, body: input.body },
      user,
    );
    await getSupabaseServerAdminClient()
      .from('checklist_item_seller_question')
      .insert({
        question_id: question.id,
        checklist_item_id: input.checklistItemId,
      })
      .throwOnError();

    await appendItemEvents(client, item.deal_id, input.checklistItemId, {
      status: { status: 'requested', requested_at: new Date().toISOString() },
      waitingOn: 'seller',
    });

    return emailOrRefuse(
      question,
      "Asked, but the email didn't send. Use Resend.",
    );
  },
  {
    auth: true,
    schema: z.object({ checklistItemId: z.uuid(), ...questionWording }),
  },
);

const SELLER_ROOM_SERVICE = {
  actor_kind: 'service',
  actor_via: 'seller_room',
} as const;

async function appendItemEvents(
  client: SupabaseClient<Database>,
  dealId: string,
  itemId: string,
  change: { status: Record<string, string>; waitingOn: 'seller' | 'us' },
  actor: Partial<typeof SELLER_ROOM_SERVICE> = {},
): Promise<void> {
  await client
    .rpc('append_deal_events', {
      p_deal_id: dealId,
      p_events: [
        {
          aggregate_type: 'checklist_item',
          aggregate_id: itemId,
          event_type: 'checklist_item.status_changed',
          payload: change.status,
          ...actor,
        },
        {
          aggregate_type: 'checklist_item',
          aggregate_id: itemId,
          event_type: 'checklist_item.waiting_on_set',
          payload: { waiting_on: change.waitingOn },
          ...actor,
        },
      ],
    })
    .throwOnError();
}

async function markRequestedItemReceived(
  admin: ReturnType<typeof getSupabaseServerAdminClient>,
  questionId: string,
  dealId: string,
): Promise<void> {
  const { data: request } = await admin
    .from('checklist_item_seller_question')
    .select('checklist_item_id')
    .eq('question_id', questionId)
    .maybeSingle()
    .throwOnError();

  if (!request) {
    return;
  }

  const { data: item } = await admin
    .from('checklist_item')
    .select('status')
    .eq('id', request.checklist_item_id)
    .single()
    .throwOnError();

  if (item.status === 'reviewed') {
    return;
  }

  await appendItemEvents(
    admin,
    dealId,
    request.checklist_item_id,
    {
      status: { status: 'received', received_at: new Date().toISOString() },
      waitingOn: 'us',
    },
    SELLER_ROOM_SERVICE,
  );
}

const LENDER_ASK_NOT_FOUND = 'That lender request was not found.';

export const askSellerAboutLenderAsk = refusableAction(
  async (input, user): Promise<string> => {
    const client = getSupabaseServerClient();

    const { data: ask } = await client
      .from('lender_ask')
      .select('id, room_id, kind')
      .eq('id', input.lenderAskId)
      .maybeSingle()
      .throwOnError();

    const { data: lenderRoom } = ask
      ? await client
          .from('lender_room')
          .select('deal_id')
          .eq('id', ask.room_id)
          .maybeSingle()
          .throwOnError()
      : { data: null };

    if (!ask || ask.kind !== 'ask' || !lenderRoom) {
      throw new Refusal(LENDER_ASK_NOT_FOUND);
    }

    const questionId = await askInRoom(
      {
        dealId: lenderRoom.deal_id,
        title: input.title,
        body: input.body,
      },
      user,
    );

    await client
      .from('seller_room_question_route')
      .insert({ question_id: questionId, lender_ask_id: ask.id })
      .throwOnError();

    return questionId;
  },
  {
    auth: true,
    schema: z.object({ lenderAskId: z.uuid(), ...questionWording }),
  },
);

export const forwardSellerAnswer = refusableAction(
  async (input) => {
    if (!input.body && input.documentIds.length === 0) {
      throw new Refusal('Write a message or choose a file.');
    }

    const client = getSupabaseServerClient();

    const [{ data: route }, { data: sellerFiles }] = await Promise.all([
      client
        .from('seller_room_question_route')
        .select('lender_ask_id')
        .eq('question_id', input.questionId)
        .maybeSingle()
        .throwOnError(),
      client
        .from('seller_room_question_file')
        .select('dr_document_id')
        .eq('question_id', input.questionId)
        .eq('side', 'seller')
        .throwOnError(),
    ]);

    if (!route) {
      throw new Refusal('This question did not come from a lender.');
    }

    const attached = new Set(sellerFiles.map((file) => file.dr_document_id));

    if (!input.documentIds.every((documentId) => attached.has(documentId))) {
      throw new Refusal(
        'Only files the seller attached can be sent to the lender.',
      );
    }

    await forwardIntoAsk({
      askId: route.lender_ask_id,
      body: input.body,
      sourceDocumentIds: input.documentIds,
    });

    await client
      .from('seller_room_question')
      .update({ status: 'closed' })
      .eq('id', input.questionId)
      .throwOnError();
  },
  {
    auth: true,
    schema: z.object({
      questionId: z.uuid(),
      body: z.string().trim().max(10_000),
      documentIds: z.array(z.uuid()).max(50),
    }),
  },
);

const ANSWERABLE = new Set(['open', 'answered']);

export const answerSellerQuestion = refusableAction(
  async (input, user) => {
    if (!input.body && input.documentIds.length === 0) {
      throw new Refusal('Write an answer or attach a file.');
    }

    const client = getSupabaseServerClient();

    const { data: question } = await client
      .from('seller_room_question')
      .select(
        'id, room_id, account_id, title, status, first_response_at, seller_room(deal_id)',
      )
      .eq('id', input.questionId)
      .maybeSingle()
      .throwOnError();

    const { data: member } = question
      ? await client
          .rpc('is_seller_room_member', { room_id: question.room_id })
          .throwOnError()
      : { data: false };

    if (!question || !member) {
      throw new Refusal('That question was not found.');
    }

    const { data: readOnlyReason } = await client
      .rpc('seller_side_read_only_reason', {
        deal_id: question.seller_room.deal_id,
      })
      .throwOnError();

    if (readOnlyReason) {
      throw new Refusal(readOnlyReason);
    }

    if (!ANSWERABLE.has(question.status)) {
      throw new Refusal('This question is closed.');
    }

    const shown = await Promise.all(
      input.documentIds.map(async (documentId) => {
        const { data } = await client
          .rpc('seller_room_shows_document', {
            room_id: question.room_id,
            document_id: documentId,
          })
          .throwOnError();

        return data;
      }),
    );

    if (shown.includes(false)) {
      throw new Refusal('That file is not in this room.');
    }

    if (input.body) {
      await client
        .from('seller_room_question_message')
        .insert({ question_id: question.id, side: 'seller', body: input.body })
        .throwOnError();
    }

    if (input.documentIds.length > 0) {
      await client
        .from('seller_room_question_file')
        .insert(
          [...new Set(input.documentIds)].map((documentId) => ({
            question_id: question.id,
            dr_document_id: documentId,
            side: 'seller' as const,
          })),
        )
        .throwOnError();
    }

    const admin = getSupabaseServerAdminClient();
    const now = new Date().toISOString();

    await admin
      .from('seller_room_question')
      .update({
        status: 'answered',
        first_response_at: question.first_response_at ?? now,
      })
      .eq('id', question.id)
      .throwOnError();

    await admin
      .from('seller_room_activity')
      .insert({
        room_id: question.room_id,
        account_id: question.account_id,
        user_id: user.id,
        side: 'seller',
        action: 'question_answered',
        payload: { question_id: question.id },
      })
      .throwOnError();

    const { data: seller } = await admin
      .from('seller_room_member')
      .select('name')
      .eq('room_id', question.room_id)
      .eq('user_id', user.id)
      .single()
      .throwOnError();

    await markRequestedItemReceived(
      admin,
      question.id,
      question.seller_room.deal_id,
    );

    const line = `${seller.name} answered "${question.title}"`;
    const { data: team } = await admin
      .from('accounts')
      .select('slug')
      .eq('id', question.account_id)
      .single()
      .throwOnError();

    await notifyDealManagers(
      admin,
      question.account_id,
      question.seller_room.deal_id,
      line,
      teamItemPath(z.string().parse(team.slug), question.seller_room.deal_id, {
        kind: 'seller-question',
        id: question.id,
      }),
    );
    await queueSellerActivity(admin, question.account_id, {
      roomId: question.room_id,
      line,
    });
  },
  {
    auth: true,
    schema: z.object({
      questionId: z.uuid(),
      body: z.string().trim().max(10_000),
      documentIds: z.array(z.uuid()).max(50),
    }),
  },
);
