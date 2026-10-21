import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Enums } from '@odb/supabase';

type Client = SupabaseClient<Database>;

export interface QuestionMessage {
  id: string;
  side: Enums<'seller_side'>;
  body: string;
  createdAt: string;
}

export interface QuestionFile {
  documentId: string;
  name: string;
  side: Enums<'seller_side'>;
}

export interface RoomQuestion {
  id: string;
  title: string;
  body: string | null;
  status: Enums<'seller_room_question_status'>;
  createdAt: string;
  messages: QuestionMessage[];
  files: QuestionFile[];
}

export interface TeamQuestion extends RoomQuestion {
  fromLenderAsk: boolean;
}

const QUESTION_COLUMNS =
  'id, title, body, status, created_at, seller_room_question_message(id, side, body, created_at), seller_room_question_file(dr_document_id, side)';

async function threads(client: Client, roomId: string) {
  const { data: questions } = await client
    .from('seller_room_question')
    .select(QUESTION_COLUMNS)
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .throwOnError();

  const documentIds = questions.flatMap((question) =>
    question.seller_room_question_file.map((file) => file.dr_document_id),
  );

  const { data: documents } = await client
    .from('dr_document')
    .select('id, name')
    .in('id', documentIds)
    .throwOnError();

  const nameOf = new Map(
    documents.map((document) => [document.id, document.name]),
  );

  return questions.map(
    (question): RoomQuestion => ({
      id: question.id,
      title: question.title,
      body: question.body,
      status: question.status,
      createdAt: question.created_at,
      messages: question.seller_room_question_message
        .map((message) => ({
          id: message.id,
          side: message.side,
          body: message.body,
          createdAt: message.created_at,
        }))
        .toSorted((a, b) => a.createdAt.localeCompare(b.createdAt)),
      files: question.seller_room_question_file.flatMap((file) => {
        const name = nameOf.get(file.dr_document_id);

        return name
          ? [{ documentId: file.dr_document_id, name, side: file.side }]
          : [];
      }),
    }),
  );
}

export async function loadRoomQuestions(
  client: Client,
  roomId: string,
): Promise<RoomQuestion[]> {
  return threads(client, roomId);
}

export async function loadQuestionAskers(
  admin: Client,
  roomId: string,
): Promise<Record<string, string>> {
  const { data: questions } = await admin
    .from('seller_room_question')
    .select('id, created_by')
    .eq('room_id', roomId)
    .throwOnError();

  const { data: askers } = await admin
    .from('accounts')
    .select('primary_owner_user_id, name')
    .eq('is_personal_account', true)
    .in(
      'primary_owner_user_id',
      questions.map((question) => question.created_by!),
    )
    .throwOnError();

  const nameOf = new Map(
    askers.map((asker) => [asker.primary_owner_user_id, asker.name]),
  );

  return Object.fromEntries(
    questions.map((question) => [
      question.id,
      nameOf.get(question.created_by!)!,
    ]),
  );
}

export async function loadTeamQuestions(
  client: Client,
  dealId: string,
): Promise<TeamQuestion[]> {
  const { data: roomId } = await client
    .rpc('seller_room_id_for_work', { deal_id: dealId })
    .throwOnError();

  if (!roomId) {
    return [];
  }

  const questions = await threads(client, roomId);

  const { data: routes } = await client
    .from('seller_room_question_route')
    .select('question_id')
    .in(
      'question_id',
      questions.map((question) => question.id),
    )
    .throwOnError();

  const routed = new Set(routes.map((route) => route.question_id));

  return questions.map((question) => ({
    ...question,
    fromLenderAsk: routed.has(question.id),
  }));
}
