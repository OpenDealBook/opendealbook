'use server';

import { PostgrestError } from '@supabase/supabase-js';

import { z } from 'zod';

import {
  DOCUMENSO_NOT_CONFIGURED,
  createDocumensoClient,
  isDocumensoConfigured,
  removeDraft,
  signersSchema,
} from '@odb/contracts/esign';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { refusableAction } from '../actions/refusable-action';
import { Refusal } from '../actions/refusal';
import { downloadObject } from '../uploads/objects';
import { convertOfficeToPdf } from '../uploads/office-to-pdf';
import { currentBlankForm } from './blank-form';
import {
  IN_PROGRESS,
  signableKind,
  signatureRequestRefusal,
} from './eligibility';
import { SIGNATURE, syncFormSignature } from './webhook';

const UNIQUE_VIOLATION = '23505';
const ONE_OPEN_REQUEST_PER_FORM = 'lender_form_signature_one_open_per_ask';

const requestFormSignatureSchema = z.object({
  formId: z.uuid(),
  signers: signersSchema,
});

export const requestFormSignature = refusableAction(
  async (input) => {
    const client = getSupabaseServerClient();

    const { data: form } = await client
      .from('lender_ask')
      .select(
        'id, room_id, title, status, return_route, signatures:lender_form_signature(status)',
      )
      .eq('id', input.formId)
      .eq('kind', 'form')
      .maybeSingle()
      .throwOnError();

    if (!form) {
      throw new Refusal('That form was not found');
    }

    const { data: isDealTeam } = await client
      .rpc('can_manage_lender_room', { room_id: form.room_id })
      .throwOnError();

    if (!isDealTeam) {
      throw new Refusal('Only the deal team can do that');
    }

    const { data: room } = await client
      .rpc('lender_room_view', { room_id: form.room_id })
      .single()
      .throwOnError();

    const blankForm = await currentBlankForm(client, form.id);

    const refusal = signatureRequestRefusal({
      returnRoute: form.return_route,
      blankFormName: blankForm.name,
      signatureStatuses: form.signatures.map((signature) => signature.status),
      formStatus: form.status,
      isRoomOpen: room.is_open === true,
    });

    if (refusal) {
      throw new Refusal(refusal);
    }

    if (!isDocumensoConfigured()) {
      throw new Refusal(DOCUMENSO_NOT_CONFIGURED);
    }

    const admin = getSupabaseServerAdminClient();
    const file = await downloadObject(admin, blankForm.storage_path);

    const documenso = createDocumensoClient();

    const draft = await documenso.createDraft({
      title: form.title,
      externalId: form.id,
      pdf:
        signableKind(blankForm.name) === 'word'
          ? await convertOfficeToPdf(file, blankForm.name)
          : file,
      signers: input.signers,
    });

    try {
      const editorUrl = await documenso.editorUrl(draft.documentId);

      await admin
        .from('lender_form_signature')
        .insert({
          ask_id: form.id,
          documenso_document_id: draft.documentId,
          signers: input.signers,
          status: 'draft',
          editor_url: editorUrl,
        })
        .throwOnError();

      return { editorUrl };
    } catch (failure) {
      await removeDraft(documenso, draft.documentId);

      if (
        failure instanceof PostgrestError &&
        failure.code === UNIQUE_VIOLATION &&
        failure.message.includes(ONE_OPEN_REQUEST_PER_FORM)
      ) {
        throw new Refusal(IN_PROGRESS);
      }

      throw failure;
    }
  },
  { auth: true, schema: requestFormSignatureSchema },
);

const checkFormSignatureSchema = z.object({ signatureId: z.uuid() });

export const checkFormSignature = refusableAction(
  async (input) => {
    const { data: signature } = await getSupabaseServerClient()
      .from('lender_form_signature')
      .select(SIGNATURE)
      .eq('id', input.signatureId)
      .maybeSingle()
      .throwOnError();

    if (!signature) {
      throw new Refusal('That signature request was not found');
    }

    if (!isDocumensoConfigured()) {
      throw new Refusal(DOCUMENSO_NOT_CONFIGURED);
    }

    return {
      status: await syncFormSignature(signature, {
        admin: getSupabaseServerAdminClient(),
        documenso: createDocumensoClient(),
      }),
    };
  },
  { auth: true, schema: checkFormSignatureSchema },
);

const cancelFormSignatureSchema = z.object({ signatureId: z.uuid() });

export const cancelFormSignature = refusableAction(
  async (input) => {
    const { data: signature } = await getSupabaseServerClient()
      .from('lender_form_signature')
      .select(SIGNATURE)
      .eq('id', input.signatureId)
      .maybeSingle()
      .throwOnError();

    if (!signature) {
      throw new Refusal('That signature request was not found');
    }

    if (signature.status === 'cancelled') {
      return { status: signature.status };
    }

    if (!isDocumensoConfigured()) {
      throw new Refusal(DOCUMENSO_NOT_CONFIGURED);
    }

    const admin = getSupabaseServerAdminClient();
    const documenso = createDocumensoClient();
    const state = await documenso.signatureState(
      signature.documenso_document_id,
    );

    if (state !== 'draft' && state !== 'missing') {
      await syncFormSignature(signature, { admin, documenso });

      throw new Refusal(
        'This signature request has already been sent and can no longer be cancelled here',
      );
    }

    const { data: cancelled } = await admin
      .from('lender_form_signature')
      .update({ status: 'cancelled' })
      .eq('id', signature.id)
      .eq('status', 'draft')
      .select('id')
      .throwOnError();

    if (cancelled.length === 0) {
      return { status: signature.status };
    }

    if (state === 'draft') {
      try {
        await documenso.deleteDraft(signature.documenso_document_id);
      } catch (failure) {
        await admin
          .from('lender_form_signature')
          .update({ status: 'draft' })
          .eq('id', signature.id)
          .eq('status', 'cancelled')
          .throwOnError();

        throw failure;
      }
    }

    return { status: 'cancelled' as const };
  },
  { auth: true, schema: cancelFormSignatureSchema },
);
