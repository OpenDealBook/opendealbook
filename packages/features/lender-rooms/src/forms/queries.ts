import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

import { Refusal } from '../actions/refusal';
import { FORM_NOT_FOUND } from './form';

type Client = SupabaseClient<Database>;

export async function listForms(client: Client, roomId: string) {
  const { data: forms } = await client
    .from('lender_ask')
    .select(
      '*, messages:lender_ask_message(created_at), files:lender_ask_file(dr_document_id, role, created_at)',
    )
    .eq('room_id', roomId)
    .eq('kind', 'form')
    .order('created_at', { referencedTable: 'files' })
    .throwOnError();

  const { data: documents } = await client
    .from('dr_document')
    .select('id, name')
    .in(
      'id',
      forms.flatMap((form) => form.files.map((file) => file.dr_document_id)),
    )
    .throwOnError();

  const nameOf = new Map(
    documents.map((document) => [document.id, document.name]),
  );

  return forms
    .map(({ messages, files, ...form }) => ({
      ...form,
      current_blank_form: files
        .filter((file) => file.role === 'blank_form')
        .map((file) => ({
          document_id: file.dr_document_id,
          name: nameOf.get(file.dr_document_id),
        }))
        .at(-1),
      completed_document_ids: files
        .filter((file) => file.role === 'completed_form')
        .map((file) => file.dr_document_id),
      signed_document_ids: files
        .filter((file) => file.role === 'signed_form')
        .map((file) => file.dr_document_id),
      last_activity_at: new Date(
        Math.max(
          ...[form, ...messages, ...files].map((row) =>
            Date.parse(row.created_at),
          ),
        ),
      ).toISOString(),
    }))
    .sort((a, b) => b.last_activity_at.localeCompare(a.last_activity_at));
}

export async function getForm(client: Client, formId: string) {
  const { data } = await client
    .from('lender_ask')
    .select('*, messages:lender_ask_message(*), files:lender_ask_file(*)')
    .eq('id', formId)
    .eq('kind', 'form')
    .order('created_at', { referencedTable: 'messages' })
    .order('created_at', { referencedTable: 'files' })
    .maybeSingle()
    .throwOnError();

  if (!data) {
    throw new Refusal(FORM_NOT_FOUND);
  }

  return data;
}
