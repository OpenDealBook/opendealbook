'use server';

import { z } from 'zod';

import { getSupabaseServerClient } from '@odb/supabase/server';

import { refusableAction } from '../actions/refusable-action';
import { Refusal } from '../actions/refusal';
import { notifyRoomMembers } from '../asks/notify';
import { replySchemaFor } from '../asks/reply-schema';
import { assertInRoomFolder, saveOurMove } from '../asks/room-checks';
import {
  FORM_COLUMNS,
  FORM_NOT_FOUND,
  type LoadedForm,
  formWording,
} from './form';

async function loadFormAsDealTeam(formId: string): Promise<LoadedForm> {
  const client = getSupabaseServerClient();

  const { data: form } = await client
    .from('lender_ask')
    .select(FORM_COLUMNS)
    .eq('id', formId)
    .maybeSingle()
    .throwOnError();

  const { data: isDealTeam } = form
    ? await client
        .rpc('can_manage_lender_room', { room_id: form.room_id })
        .throwOnError()
    : { data: false };

  if (!form || !isDealTeam) {
    throw new Refusal('Only the deal team can do that');
  }

  if (form.kind !== 'form') {
    throw new Refusal(FORM_NOT_FOUND);
  }

  return form;
}

const returnCompletedFormSchema = z.object({
  formId: z.uuid(),
  documentIds: z.array(z.uuid()).min(1, 'Choose the completed form to return'),
});

export const returnCompletedForm = refusableAction(
  async (input) => {
    const form = await loadFormAsDealTeam(input.formId);

    await assertInRoomFolder(form.room_id, input.documentIds);

    await getSupabaseServerClient()
      .from('lender_ask_file')
      .insert(
        input.documentIds.map((documentId) => ({
          ask_id: form.id,
          dr_document_id: documentId,
          role: 'completed_form' as const,
        })),
      )
      .throwOnError();

    await saveOurMove(form, 'reply');

    await notifyRoomMembers('lender_form.returned', {
      roomId: form.room_id,
      payload: { roomId: form.room_id, askId: form.id, kind: 'form' },
    });
  },
  { auth: true, schema: returnCompletedFormSchema },
);

export const replyToFormAsInternal = refusableAction(
  async (input) => {
    const client = getSupabaseServerClient();
    const documentIds = input.documentIds ?? [];
    const form = await loadFormAsDealTeam(input.formId);

    await assertInRoomFolder(form.room_id, documentIds);

    if (input.body) {
      await client
        .from('lender_ask_message')
        .insert({ ask_id: form.id, side: 'internal', body: input.body })
        .throwOnError();
    }

    await client
      .from('lender_ask_file')
      .insert(
        documentIds.map((documentId) => ({
          ask_id: form.id,
          dr_document_id: documentId,
          role: 'attachment' as const,
        })),
      )
      .throwOnError();

    await saveOurMove(form, 'reply');

    await notifyRoomMembers('lender_ask.answered', {
      roomId: form.room_id,
      payload: { roomId: form.room_id, askId: form.id, kind: 'form' },
    });
  },
  { auth: true, schema: replySchemaFor('formId') },
);

const formIdSchema = z.object({ formId: z.uuid() });

export const closeFormAsInternal = refusableAction(
  async (input) => {
    await saveOurMove(
      await loadFormAsDealTeam(input.formId),
      'close',
      formWording,
    );
  },
  { auth: true, schema: formIdSchema },
);
