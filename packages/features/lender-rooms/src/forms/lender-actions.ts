'use server';

// Lenders have no write path at the database, so these actions verify the
// caller and then write with the service role. The membership check must come
// first.
import { z } from 'zod';

import { isDocumensoConfigured } from '@odb/contracts/esign';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { refusableAction } from '../actions/refusable-action';
import { Refusal } from '../actions/refusal';
import { notifyOurTeam } from '../asks/notify';
import { replySchemaFor } from '../asks/reply-schema';
import {
  assertRoomMember,
  assertRoomShowsDocuments,
  saveLenderMove,
} from '../asks/room-checks';
import { storedSize } from '../uploads/objects';
import {
  FORM_COLUMNS,
  FORM_NOT_FOUND,
  type LoadedForm,
  formWording,
} from './form';
import { allowedReturnRoutes } from './return-routes';
import { noteSchema, titleSchema } from './schemas';

const MAX_FOLDER_DEPTH = 50;

async function assertUploadedToRoom(roomId: string, documentId: string) {
  const { data: room } = await getSupabaseServerClient()
    .rpc('lender_room_view', { room_id: roomId })
    .single()
    .throwOnError();

  const admin = getSupabaseServerAdminClient();

  const { data: document } = await admin
    .from('dr_document')
    .select('folder_id')
    .eq('id', documentId)
    .maybeSingle()
    .throwOnError();

  let folderId: string | null | undefined = document?.folder_id;

  for (
    let depth = 0;
    folderId && folderId !== room.private_folder_id && depth < MAX_FOLDER_DEPTH;
    depth += 1
  ) {
    const { data: folder } = await admin
      .from('dr_folder')
      .select('parent_id')
      .eq('id', folderId)
      .single()
      .throwOnError();

    folderId = folder.parent_id;
  }

  if (folderId !== room.private_folder_id) {
    throw new Refusal('Upload the form to your room first');
  }

  await assertRoomShowsDocuments(roomId, [documentId]);
}

async function assertRouteAllowedFor(
  documentId: string,
  route: LoadedForm['return_route'],
) {
  const { data: document } = await getSupabaseServerAdminClient()
    .from('dr_document')
    .select('name')
    .eq('id', documentId)
    .single()
    .throwOnError();

  if (
    !allowedReturnRoutes(document.name).some((allowed) => allowed === route)
  ) {
    throw new Refusal('Only PDF and Word forms can come back by e-sign');
  }
}

function assertEsignAvailableFor(route: LoadedForm['return_route']) {
  if (route === 'esign' && !isDocumensoConfigured()) {
    throw new Refusal(
      'E-signature is not available for this room. Choose to get the completed file back instead',
    );
  }
}

async function attachDocuments(
  formId: string,
  userId: string,
  role: 'blank_form' | 'attachment',
  documentIds: string[],
) {
  const { data: files } = await getSupabaseServerAdminClient()
    .from('lender_ask_file')
    .insert(
      documentIds.map((documentId) => ({
        ask_id: formId,
        dr_document_id: documentId,
        role,
        added_by: userId,
      })),
    )
    .select('id')
    .throwOnError();

  return files.map((file) => file.id);
}

async function loadFormAsRoomMember(formId: string): Promise<LoadedForm> {
  const { data: form } = await getSupabaseServerAdminClient()
    .from('lender_ask')
    .select(FORM_COLUMNS)
    .eq('id', formId)
    .eq('kind', 'form')
    .maybeSingle()
    .throwOnError();

  if (form) {
    const { data: isMember } = await getSupabaseServerClient()
      .rpc('is_lender_room_member', { room_id: form.room_id })
      .throwOnError();

    if (isMember) {
      return form;
    }
  }

  throw new Refusal(FORM_NOT_FOUND);
}

async function loadFormNotOutForSignature(formId: string) {
  const form = await loadFormAsRoomMember(formId);

  const { data: openRequest } = await getSupabaseServerAdminClient()
    .from('lender_form_signature')
    .select('id')
    .eq('ask_id', form.id)
    .in('status', ['draft', 'sent'])
    .maybeSingle()
    .throwOnError();

  if (openRequest) {
    throw new Refusal(
      'This form is out for signature. Reply here if something needs to change.',
    );
  }

  return form;
}

const returnRouteSchema = z.enum(['upload', 'esign']);

const openFormSchema = z.object({
  roomId: z.uuid(),
  title: titleSchema,
  note: noteSchema,
  documentId: z.uuid(),
  returnRoute: returnRouteSchema,
});

export const openForm = refusableAction(
  async (input, user) => {
    await assertRoomMember(input.roomId);
    await assertUploadedToRoom(input.roomId, input.documentId);
    assertEsignAvailableFor(input.returnRoute);
    await assertRouteAllowedFor(input.documentId, input.returnRoute);

    const admin = getSupabaseServerAdminClient();

    const { data: room } = await admin
      .from('lender_room')
      .select('account_id')
      .eq('id', input.roomId)
      .single()
      .throwOnError();

    const { data: form } = await admin
      .from('lender_ask')
      .insert({
        room_id: input.roomId,
        account_id: room.account_id,
        kind: 'form',
        title: input.title,
        body: input.note || null,
        return_route: input.returnRoute,
        created_by: user.id,
      })
      .select('id')
      .single()
      .throwOnError();

    try {
      await attachDocuments(form.id, user.id, 'blank_form', [input.documentId]);
    } catch (error) {
      await admin.from('lender_ask').delete().eq('id', form.id).throwOnError();

      throw error;
    }

    await notifyOurTeam({
      eventType: 'lender_form.uploaded',
      accountId: room.account_id,
      eventKey: form.id,
      payload: { roomId: input.roomId, askId: form.id, kind: 'form' },
    });

    return form.id;
  },
  { auth: true, schema: openFormSchema },
);

const sentFormTitleSchema = z.object({
  roomId: z.uuid(),
  name: z.string(),
  size: z.number().int().nonnegative(),
});

export const sentFormTitle = refusableAction(
  async (input) => {
    await assertRoomMember(input.roomId);

    const admin = getSupabaseServerAdminClient();

    const { data: forms } = await admin
      .from('lender_ask')
      .select('title, files:lender_ask_file(dr_document_id, role)')
      .eq('room_id', input.roomId)
      .eq('kind', 'form')
      .in('status', ['open', 'answered'])
      .throwOnError();

    const { data: documents } = await admin
      .from('dr_document')
      .select('id, storage_path')
      .eq('name', input.name)
      .in(
        'id',
        forms.flatMap((form) =>
          form.files
            .filter((file) => file.role === 'blank_form')
            .map((file) => file.dr_document_id),
        ),
      )
      .throwOnError();

    for (const document of documents) {
      if ((await storedSize(admin, document.storage_path)) === input.size) {
        return forms.find((form) =>
          form.files.some((file) => file.dr_document_id === document.id),
        )!.title;
      }
    }

    return null;
  },
  { auth: true, schema: sentFormTitleSchema },
);

const replaceBlankFormSchema = z.object({
  formId: z.uuid(),
  documentId: z.uuid(),
});

export const replaceBlankForm = refusableAction(
  async (input, user) => {
    const form = await loadFormNotOutForSignature(input.formId);

    await assertUploadedToRoom(form.room_id, input.documentId);
    await assertRouteAllowedFor(input.documentId, form.return_route);
    await saveLenderMove(
      form,
      'edit',
      {},
      { ...formWording, action: 'replace this form' },
    );

    const admin = getSupabaseServerAdminClient();
    const fileIds = await attachDocuments(form.id, user.id, 'blank_form', [
      input.documentId,
    ]);

    const { data: afterwards } = await admin
      .from('lender_ask')
      .select('first_response_at')
      .eq('id', form.id)
      .single()
      .throwOnError();

    if (afterwards.first_response_at) {
      await admin
        .from('lender_ask_file')
        .delete()
        .in('id', fileIds)
        .throwOnError();

      throw new Refusal(
        'This changed while you were working. Reload and try again.',
      );
    }
  },
  { auth: true, schema: replaceBlankFormSchema },
);

const changeReturnRouteSchema = z.object({
  formId: z.uuid(),
  returnRoute: returnRouteSchema,
});

export const changeReturnRoute = refusableAction(
  async (input) => {
    const form = await loadFormNotOutForSignature(input.formId);

    assertEsignAvailableFor(input.returnRoute);

    const { data: blankForm } = await getSupabaseServerAdminClient()
      .from('lender_ask_file')
      .select('dr_document_id')
      .eq('ask_id', form.id)
      .eq('role', 'blank_form')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
      .throwOnError();

    await assertRouteAllowedFor(blankForm.dr_document_id, input.returnRoute);
    await saveLenderMove(
      form,
      'edit',
      { return_route: input.returnRoute },
      { ...formWording, action: 'change how this form comes back' },
    );
  },
  { auth: true, schema: changeReturnRouteSchema },
);

const editFormSchema = z.object({
  formId: z.uuid(),
  title: titleSchema,
  note: noteSchema,
});

export const editForm = refusableAction(
  async (input) => {
    const form = await loadFormNotOutForSignature(input.formId);

    await saveLenderMove(
      form,
      'edit',
      { title: input.title, body: input.note || null },
      formWording,
    );
  },
  { auth: true, schema: editFormSchema },
);

const formIdSchema = z.object({ formId: z.uuid() });

export const withdrawForm = refusableAction(
  async (input) => {
    await saveLenderMove(
      await loadFormNotOutForSignature(input.formId),
      'withdraw',
      {},
      formWording,
    );
  },
  { auth: true, schema: formIdSchema },
);

export const replyToFormAsLender = refusableAction(
  async (input, user) => {
    const documentIds = input.documentIds ?? [];
    const form = await loadFormAsRoomMember(input.formId);

    await assertRoomShowsDocuments(form.room_id, documentIds);
    await saveLenderMove(form, 'reply');

    const message = input.body
      ? (
          await getSupabaseServerAdminClient()
            .from('lender_ask_message')
            .insert({
              ask_id: form.id,
              author_user_id: user.id,
              side: 'lender',
              body: input.body,
            })
            .select('id')
            .single()
            .throwOnError()
        ).data
      : null;

    const fileIds = await attachDocuments(
      form.id,
      user.id,
      'attachment',
      documentIds,
    );

    await notifyOurTeam({
      eventType: 'lender_ask.replied',
      accountId: form.account_id,
      eventKey: message?.id ?? fileIds[0]!,
      payload: { roomId: form.room_id, askId: form.id, kind: 'form' },
    });
  },
  { auth: true, schema: replySchemaFor('formId') },
);

export const closeFormAsLender = refusableAction(
  async (input) => {
    await saveLenderMove(
      await loadFormNotOutForSignature(input.formId),
      'close',
      {},
      formWording,
    );
  },
  { auth: true, schema: formIdSchema },
);
