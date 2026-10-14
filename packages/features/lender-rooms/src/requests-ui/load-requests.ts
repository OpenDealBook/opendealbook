import { notFound } from 'next/navigation';

import type { SupabaseClient } from '@supabase/supabase-js';

import { z } from 'zod';

import type { Database, Enums } from '@odb/supabase';

import { type getAsk, listAsks } from '../asks/queries';
import { listForms } from '../forms/queries';
import { lenderNames } from '../members/person-name';
import { newestSignature, requestIsInRoom } from './request-access';
import { buildThread } from './thread';

type Client = SupabaseClient<Database>;

export async function loadRequests(client: Client, roomId: string) {
  const [asks, forms] = await Promise.all([
    listAsks(client, roomId),
    listForms(client, roomId),
  ]);

  return {
    asks: asks
      .filter((ask) => ask.kind === 'ask')
      .map((ask) => ({ ...ask, latest_signature_status: null })),
    forms: await Promise.all(
      forms.map(async (form) => ({
        ...form,
        latest_signature_status:
          form.return_route === 'esign'
            ? ((await loadLatestSignature(client, form.id))?.status ?? null)
            : null,
      })),
    ),
  };
}

export async function requireRequestInRoom(
  client: Client,
  {
    kind,
    roomId,
    requestId,
  }: { kind: Enums<'lender_ask_kind'>; roomId: string; requestId: string },
) {
  if (!z.uuid().safeParse(requestId).success) {
    notFound();
  }

  const { data: found } = await client
    .from('lender_ask')
    .select('room_id')
    .eq('id', requestId)
    .eq('kind', kind)
    .maybeSingle()
    .throwOnError();

  if (!requestIsInRoom(found, roomId)) {
    notFound();
  }
}

export async function loadThread(
  client: Client,
  request: Awaited<ReturnType<typeof getAsk>>,
) {
  const [{ data: documents }, { data: members }] = await Promise.all([
    client
      .from('dr_document')
      .select('id, name')
      .in(
        'id',
        request.files.map((file) => file.dr_document_id),
      )
      .throwOnError(),
    client
      .from('lender_room_member')
      .select('user_id, email')
      .eq('room_id', request.room_id)
      .throwOnError(),
  ]);

  const names = await lenderNames(
    client,
    members.map((member) => member.user_id),
  );

  return buildThread({
    request,
    messages: request.messages,
    files: request.files,
    documents,
    members: members.map((member) => ({
      ...member,
      name: names.get(member.user_id) ?? null,
    })),
  });
}

export async function loadLatestSignature(client: Client, formId: string) {
  const { data: signatures } = await client
    .rpc('lender_form_signature_status', { ask_id: formId })
    .throwOnError();

  return newestSignature(signatures);
}

export async function loadCanAct(client: Client, roomId: string) {
  const { data: isMember } = await client
    .rpc('is_lender_room_member', { room_id: roomId })
    .throwOnError();

  return isMember;
}
