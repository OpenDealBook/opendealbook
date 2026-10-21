import 'server-only';
import {
  type DocumensoClient,
  assertSignedPdf,
  deterministicUuid,
  isStaleAggregate,
  setMilestoneActual,
} from '@odb/contracts/esign';
import { appendDealEvent } from '@odb/events';
import type { Enums, Tables } from '@odb/supabase';

import { notifyOurTeam, notifyRoomMembers } from '../asks/notify';
import { transitionAsk } from '../asks/transition';
import { type Admin, storeOnce } from '../uploads/objects';
import { FILE_EXTENSION } from '../uploads/office-to-pdf';
import { currentBlankForm } from './blank-form';
import { signatureTransition } from './signature-outcome';

interface FormSignatureDeps {
  admin: Admin;
  documenso: Pick<DocumensoClient, 'signatureState' | 'downloadSignedPdf'>;
}

type Signature = Pick<
  Tables<'lender_form_signature'>,
  'id' | 'ask_id' | 'documenso_document_id' | 'status'
>;

type Form = Pick<
  Tables<'lender_ask'>,
  'id' | 'room_id' | 'account_id' | 'title' | 'status' | 'first_response_at'
>;

export const SIGNATURE = 'id, ask_id, documenso_document_id, status';

export async function handleFormSignatureEvent(
  documensoDocumentId: string,
  deps: FormSignatureDeps,
): Promise<boolean> {
  const { data: signature } = await deps.admin
    .from('lender_form_signature')
    .select(SIGNATURE)
    .eq('documenso_document_id', documensoDocumentId)
    .maybeSingle()
    .throwOnError();

  if (!signature) {
    return false;
  }

  await syncFormSignature(signature, deps);

  return true;
}

export async function syncFormSignature(
  signature: Signature,
  deps: FormSignatureDeps,
): Promise<Enums<'lender_signature_status'>> {
  const reading = await deps.documenso.signatureState(
    signature.documenso_document_id,
  );
  const transition = signatureTransition(signature.status, reading.state);

  if (transition === null) {
    return signature.status;
  }

  const { data: form } = await deps.admin
    .from('lender_ask')
    .select('id, room_id, account_id, title, status, first_response_at')
    .eq('id', signature.ask_id)
    .single()
    .throwOnError();

  if (reading.state === 'completed') {
    await fileSignedForm(deps, signature, form, reading.completedOn);
  }

  const { data: recorded } = await deps.admin
    .from('lender_form_signature')
    .update({ status: transition.to })
    .eq('id', signature.id)
    .in('status', transition.from)
    .select('id')
    .throwOnError();

  if (transition.to !== 'sent' && recorded.length > 0) {
    const eventType = `lender_form.signature_${transition.to}` as const;
    const told = { roomId: form.room_id, askId: form.id };

    await Promise.all([
      notifyRoomMembers(eventType, {
        roomId: form.room_id,
        payload: { ...told, audience: 'lender' },
      }),
      notifyOurTeam({
        eventType,
        accountId: form.account_id,
        eventKey: `${signature.id}:${transition.to}`,
        payload: { ...told, audience: 'team' },
      }),
    ]);
  }

  return transition.to;
}

async function fileSignedForm(
  { admin, documenso }: FormSignatureDeps,
  signature: Signature,
  form: Form,
  signedOn: string,
) {
  const { data: room } = await admin
    .from('lender_room')
    .select('deal_id, name, private_folder_id')
    .eq('id', form.room_id)
    .single()
    .throwOnError();

  const { data: registered } = await admin
    .from('dr_document')
    .select('id')
    .eq('id', signature.id)
    .maybeSingle()
    .throwOnError();

  if (!registered) {
    const signedPdf = await documenso.downloadSignedPdf(
      signature.documenso_document_id,
    );
    assertSignedPdf(signedPdf);

    const storagePath = `deal/${room.deal_id}/${signature.id}-signed.pdf`;

    await storeOnce(admin, storagePath, signedPdf, {
      contentType: 'application/pdf',
    });

    try {
      await appendDealEvent(admin, {
        dealId: room.deal_id,
        aggregateType: 'dr_document',
        aggregateId: signature.id,
        eventType: 'dr_document.added',
        actorKind: 'service',
        expectedAggregateSeq: 0,
        payload: {
          folder_id: room.private_folder_id,
          name: await signedCopyName(admin, form.id, room.private_folder_id),
          storage_path: storagePath,
          version: 1,
        },
      });
    } catch (failure) {
      if (!isStaleAggregate(failure)) {
        throw failure;
      }
    }
  }

  await setMilestoneActual(
    admin,
    room.deal_id,
    {
      id: deterministicUuid(`signed form milestone:${signature.id}`),
      kind: 'custom',
      label: `${form.title} signed (${room.name})`,
    },
    signedOn,
    { actorKind: 'service', actorVia: 'documenso' },
  );

  await admin
    .from('lender_ask_file')
    .upsert(
      {
        id: signature.id,
        ask_id: form.id,
        dr_document_id: signature.id,
        role: 'signed_form',
      },
      { onConflict: 'id', ignoreDuplicates: true },
    )
    .throwOnError();

  await admin
    .from('lender_ask')
    .update(
      transitionAsk(
        form,
        { side: 'internal', kind: 'reply' },
        new Date().toISOString(),
      ),
    )
    .eq('id', form.id)
    .throwOnError();
}

async function signedCopyName(
  admin: Admin,
  formId: string,
  folderId: string,
): Promise<string> {
  const blankForm = await currentBlankForm(admin, formId);

  const { data: inFolder } = await admin
    .from('dr_document')
    .select('name')
    .eq('folder_id', folderId)
    .throwOnError();

  const taken = new Set(inFolder.map((document) => document.name));
  const base = blankForm.name.replace(FILE_EXTENSION, '');
  let name = `${base} (signed).pdf`;

  for (let copy = 2; taken.has(name); copy += 1) {
    name = `${base} (signed ${copy}).pdf`;
  }

  return name;
}
