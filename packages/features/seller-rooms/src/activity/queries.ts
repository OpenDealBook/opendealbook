import type { SupabaseClient } from '@supabase/supabase-js';

import { z } from 'zod';

import type { Database } from '@odb/supabase';

import { sellerAttachmentName } from '../files/document-name';
import { meetingLabel } from '../meetings/meeting-label';

type Client = SupabaseClient<Database>;

export type SellerRoomActivityItem =
  | { kind: 'file'; documentId: string; name: string; isRemoved: boolean }
  | { kind: 'folder'; name: string }
  | { kind: 'meeting'; name: string }
  | { kind: 'question'; questionId: string; title: string }
  | { kind: 'zip'; fileCount: number }
  | { kind: 'sent'; name: string };

export interface SellerRoomActivityEntry {
  id: string;
  action: Database['public']['Enums']['seller_activity_action'];
  side: Database['public']['Enums']['seller_side'];
  person: { name: string | null; email: string | null; isRemoved: boolean };
  item: SellerRoomActivityItem | null;
  at: string;
}

const payloadSchema = z
  .object({
    meeting_id: z.string(),
    question_id: z.string(),
    share_id: z.string(),
    document_ids: z.array(z.string()),
  })
  .partial()
  .nullable();

export async function loadSellerRoomActivity(
  client: Client,
  admin: Client,
  dealId: string,
): Promise<SellerRoomActivityEntry[]> {
  const { data: room } = await client
    .from('seller_room')
    .select(
      'id, seller_room_activity(id, action, side, user_id, dr_document_id, dr_folder_id, payload, created_at), seller_room_member(user_id, name, email), seller_room_removed_member(user_id, email)',
    )
    .eq('deal_id', dealId)
    .maybeSingle()
    .throwOnError();

  if (!room) {
    return [];
  }

  const rows = room.seller_room_activity.map((row) => ({
    ...row,
    payload: payloadSchema.parse(row.payload) ?? {},
  }));
  const idsOf = (
    pick: (row: (typeof rows)[number]) => string | null | undefined,
  ) => [...new Set(rows.flatMap((row) => pick(row) ?? []))];

  const [
    { data: people },
    { data: documents },
    { data: folders },
    { data: meetings },
    { data: questions },
    { data: sent },
  ] = await Promise.all([
    client.rpc('deal_people', { deal_id: dealId }).throwOnError(),
    admin
      .from('dr_document')
      .select('id, name, removed_at')
      .in(
        'id',
        idsOf((row) => row.dr_document_id),
      )
      .throwOnError(),
    client
      .from('dr_folder')
      .select('id, name')
      .in(
        'id',
        idsOf((row) => row.dr_folder_id),
      )
      .throwOnError(),
    client
      .from('meeting')
      .select('id, type, scheduled_at')
      .in(
        'id',
        idsOf((row) => row.payload.meeting_id),
      )
      .throwOnError(),
    client
      .from('seller_room_question')
      .select('id, title')
      .in(
        'id',
        idsOf((row) => row.payload.question_id),
      )
      .throwOnError(),
    client.rpc('seller_room_documents', { room_id: room.id }).throwOnError(),
  ]);

  const members = new Map(
    room.seller_room_member.map((member) => [member.user_id, member]),
  );
  const removed = new Map(
    room.seller_room_removed_member.map((gone) => [gone.user_id, gone]),
  );
  const named = new Map(
    people.flatMap((p) => (p.user_id ? [[p.user_id, p]] : [])),
  );
  const documentsById = new Map(documents.map((d) => [d.id, d]));
  const foldersById = new Map(folders.map((f) => [f.id, f]));
  const meetingsById = new Map(meetings.map((m) => [m.id, m]));
  const questionsById = new Map(questions.map((q) => [q.id, q]));
  const sentById = new Map(sent.map((s) => [s.share_id, s]));

  function personOf(userId: string | null) {
    const member = userId ? members.get(userId) : undefined;

    if (member) {
      return { name: member.name, email: member.email, isRemoved: false };
    }

    const gone = userId ? removed.get(userId) : undefined;

    if (gone) {
      return { name: null, email: gone.email, isRemoved: true };
    }

    const person = userId ? named.get(userId) : undefined;

    return {
      name: person?.name ?? null,
      email: person?.email ?? null,
      isRemoved: false,
    };
  }

  function itemOf(row: (typeof rows)[number]): SellerRoomActivityItem | null {
    const document = row.dr_document_id
      ? documentsById.get(row.dr_document_id)
      : undefined;
    const folder = row.dr_folder_id
      ? foldersById.get(row.dr_folder_id)
      : undefined;
    const meeting = row.payload.meeting_id
      ? meetingsById.get(row.payload.meeting_id)
      : undefined;
    const question = row.payload.question_id
      ? questionsById.get(row.payload.question_id)
      : undefined;
    const share = row.payload.share_id
      ? sentById.get(row.payload.share_id)
      : undefined;

    if (document) {
      return {
        kind: 'file',
        documentId: document.id,
        name: document.name,
        isRemoved: document.removed_at !== null,
      };
    }

    if (folder) {
      return { kind: 'folder', name: folder.name };
    }

    if (meeting) {
      return { kind: 'meeting', name: meetingLabel(meeting) };
    }

    if (question) {
      return {
        kind: 'question',
        questionId: question.id,
        title: question.title,
      };
    }

    if (row.payload.document_ids) {
      return { kind: 'zip', fileCount: row.payload.document_ids.length };
    }

    if (share) {
      return {
        kind: 'sent',
        name: sellerAttachmentName(share.template_name, share.firm_name),
      };
    }

    return null;
  }

  return rows
    .toSorted((a, b) => b.created_at.localeCompare(a.created_at))
    .map((row) => ({
      id: row.id,
      action: row.action,
      side: row.side,
      person: personOf(row.user_id),
      item: itemOf(row),
      at: row.created_at,
    }));
}
