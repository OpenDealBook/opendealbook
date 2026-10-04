'use server';

import { z } from 'zod';

import { enhanceAction } from '@odb/next/actions';
import { createNovuClient, triggerNotification } from '@odb/notifications/server';
import { getSupabaseServerClient } from '@odb/supabase/server';

import {
  assertChecklistsManager,
  assertDealChecklistsManager,
} from '../templates/permissions';
import { isLoiSigned } from './loi';

const poseSellerQuestionSchema = z.object({
  dealId: z.uuid(),
  question: z.string().min(1),
  scheduleWeekId: z.uuid().optional(),
});

export const poseSellerQuestion = enhanceAction(
  async (input, user) => {
    const client = getSupabaseServerClient();

    await assertDealChecklistsManager(client, input.dealId);

    const { data: deal } = await client
      .from('deal')
      .select('account_id')
      .eq('id', input.dealId)
      .single()
      .throwOnError();

    const { data: question } = await client
      .from('seller_question')
      .insert({
        account_id: deal.account_id,
        deal_id: input.dealId,
        question: input.question,
        schedule_week_id: input.scheduleWeekId ?? null,
        asked_by: user.id,
      })
      .select('*')
      .single()
      .throwOnError();

    const { data: seller } = await client
      .from('deal_participant')
      .select('user_id')
      .eq('deal_id', input.dealId)
      .eq('party', 'seller')
      .limit(1)
      .single()
      .throwOnError();

    await triggerNotification(
      { novu: createNovuClient(), client },
      {
        eventType: 'seller_question.posed',
        recipientUserId: seller.user_id,
        payload: { dealId: input.dealId, questionId: question.id },
      },
    );

    return question;
  },
  { auth: true, schema: poseSellerQuestionSchema },
);

const answerSellerQuestionSchema = z.object({
  questionId: z.uuid(),
  answer: z.string().min(1),
});

export const answerSellerQuestion = enhanceAction(
  async (input) => {
    const client = getSupabaseServerClient();

    const { data: question } = await client
      .from('seller_question')
      .select('deal_id')
      .eq('id', input.questionId)
      .single()
      .throwOnError();

    if (!(await isLoiSigned(client, question.deal_id))) {
      throw new Error(
        'A seller question can be answered only after the LOI is signed',
      );
    }

    const { data: answered } = await client
      .from('seller_question')
      .update({
        answer: input.answer,
        answered_at: new Date().toISOString(),
        status: 'received',
      })
      .eq('id', input.questionId)
      .select('*')
      .single()
      .throwOnError();

    const { data: deal } = await client
      .from('deal')
      .select('owner_user_id')
      .eq('id', question.deal_id)
      .single()
      .throwOnError();

    await triggerNotification(
      { novu: createNovuClient(), client },
      {
        eventType: 'seller_question.answered',
        recipientUserId: deal.owner_user_id!,
        payload: { dealId: question.deal_id, questionId: input.questionId },
      },
    );

    return answered;
  },
  { auth: true, schema: answerSellerQuestionSchema },
);

const addSellerQuestionNoteSchema = z.object({
  questionId: z.uuid(),
  note: z.string().min(1),
});

export const addSellerQuestionNote = enhanceAction(
  async (input, user) => {
    const client = getSupabaseServerClient();

    const { data: question } = await client
      .from('seller_question')
      .select('deal_id, account_id')
      .eq('id', input.questionId)
      .single()
      .throwOnError();

    await assertChecklistsManager(client, question.account_id, user.id);

    const { data: note } = await client
      .from('seller_question_note')
      .insert({
        seller_question_id: input.questionId,
        deal_id: question.deal_id,
        account_id: question.account_id,
        note: input.note,
      })
      .select('*')
      .single()
      .throwOnError();

    return note;
  },
  { auth: true, schema: addSellerQuestionNoteSchema },
);

const listSellerQuestionNotesSchema = z.object({
  questionId: z.uuid(),
});

export const listSellerQuestionNotes = enhanceAction(
  async (input) => {
    const client = getSupabaseServerClient();

    const { data } = await client
      .from('seller_question_note')
      .select('*')
      .eq('seller_question_id', input.questionId)
      .order('created_at', { ascending: true })
      .throwOnError();

    return data;
  },
  { auth: true, schema: listSellerQuestionNotesSchema },
);
