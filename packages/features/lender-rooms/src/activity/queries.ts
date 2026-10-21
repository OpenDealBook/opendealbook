import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Json } from '@odb/supabase';

type Client = SupabaseClient<Database>;
type Enums = Database['public']['Enums'];

interface EntryOrigin {
  id: string;
  at: string;
  userId: string | null;
  name: string | null;
  isRemoved: boolean;
  side: Enums['lender_side'];
}

interface AskReference {
  askId: string;
  askKind: Enums['lender_ask_kind'];
  askTitle: string;
}

export type RoomActivityEntry =
  | (EntryOrigin & {
      kind: 'recorded';
      email: string;
      action: Enums['lender_activity_action'];
      documentId: string | null;
      documentName: string | null;
      folderId: string | null;
      folderName: string | null;
      faqEntryId: string | null;
      faqQuestion: string | null;
      faqEntryRemoved: boolean;
      faqFileId: string | null;
      faqFileName: string | null;
      payload: Json | null;
    })
  | (EntryOrigin &
      AskReference & {
        kind: 'request_opened' | 'form_uploaded' | 'reply';
        email: string;
      })
  | (EntryOrigin &
      AskReference & {
        kind: 'thread_file';
        email: string | null;
        documentId: string;
        documentName: string | null;
        role: Enums['lender_ask_file_role'];
      })
  | (EntryOrigin & {
      kind: 'file_uploaded';
      email: string;
      documentId: string;
      documentName: string;
      folderId: string;
      folderName: string;
    });

export interface DocumentSeenBy {
  documentId: string;
  documentName: string | null;
  userId: string | null;
  email: string;
  name: string | null;
  isRemoved: boolean;
  side: Enums['lender_side'];
  firstPreviewedAt: string | null;
  firstDownloadedAt: string | null;
}

export async function fetchRoomActivity(
  client: Client,
  roomId: string,
): Promise<RoomActivityEntry[]> {
  const { data: room } = await client
    .from('lender_room')
    .select('account_id, deal_id, private_folder_id')
    .eq('id', roomId)
    .maybeSingle()
    .throwOnError();

  if (!room) {
    return [];
  }

  const [{ data: rows }, { data: asks }, { data: folders }, people] =
    await Promise.all([
      client
        .from('lender_room_activity')
        .select(
          'id, created_at, user_id, side, action, dr_document_id, dr_folder_id, faq_entry_id, faq_file_id, payload',
        )
        .eq('room_id', roomId)
        .throwOnError(),
      client
        .from('lender_ask')
        .select('id, kind, title, created_by, created_at')
        .eq('room_id', roomId)
        .throwOnError(),
      client
        .from('dr_folder')
        .select('id, parent_id, name')
        .eq('deal_id', room.deal_id)
        .throwOnError(),
      peopleById(client, roomId),
    ]);

  const asksById = new Map(asks.map((ask) => [ask.id, ask]));
  const foldersById = new Map(folders.map((folder) => [folder.id, folder]));
  const privateFolderIds = [room.private_folder_id];

  for (const folderId of privateFolderIds) {
    privateFolderIds.push(
      ...folders
        .filter((folder) => folder.parent_id === folderId)
        .map((folder) => folder.id),
    );
  }

  const [
    { data: messages },
    { data: askFiles },
    { data: privateDocuments },
    documentNames,
    { data: faqEntries },
    faqFileNames,
  ] = await Promise.all([
      client
        .from('lender_ask_message')
        .select('id, ask_id, author_user_id, side, created_at')
        .in('ask_id', [...asksById.keys()])
        .throwOnError(),
      client
        .from('lender_ask_file')
        .select('id, ask_id, dr_document_id, role, added_by, created_at')
        .in('ask_id', [...asksById.keys()])
        .order('created_at')
        .throwOnError(),
      client
        .from('dr_document')
        .select('id, name, folder_id, uploaded_by, created_at')
        .in('folder_id', privateFolderIds)
        .throwOnError(),
      namesById(
        client,
        'dr_document',
        rows.map((row) => row.dr_document_id),
      ),
      client
        .from('lender_faq_entry')
        .select('id, question, status')
        .in('id', [
          ...new Set(rows.flatMap((row) => row.faq_entry_id ?? [])),
        ])
        .throwOnError(),
      namesById(
        client,
        'lender_faq_file',
        rows.map((row) => row.faq_file_id),
      ),
    ]);

  const faqEntriesById = new Map(faqEntries.map((entry) => [entry.id, entry]));
  const attachedIds = new Set(askFiles.map((file) => file.dr_document_id));
  const uploads = privateDocuments.flatMap((document) =>
    document.uploaded_by && !attachedIds.has(document.id)
      ? [{ ...document, uploaded_by: document.uploaded_by }]
      : [],
  );

  const formsWithBlank = new Set<string>();
  const threadFiles = askFiles.filter((file) => {
    const startsForm =
      file.role === 'blank_form' && !formsWithBlank.has(file.ask_id);

    formsWithBlank.add(file.ask_id);

    return !startsForm;
  });

  const [threadFileNames, sides] = await Promise.all([
    namesById(
      client,
      'dr_document',
      threadFiles.map((file) => file.dr_document_id),
    ),
    sidesByUser(client, room.account_id, [
      ...asks.flatMap((ask) => (ask.created_by ? [ask.created_by] : [])),
      ...uploads.map((upload) => upload.uploaded_by),
      ...threadFiles.flatMap((file) => (file.added_by ? [file.added_by] : [])),
    ]),
  ]);

  const askReference = (askId: string): AskReference => {
    const ask = asksById.get(askId)!;

    return { askId, askKind: ask.kind, askTitle: ask.title };
  };

  const entries: RoomActivityEntry[] = [
    ...rows.map((row) => ({
      kind: 'recorded' as const,
      id: row.id,
      at: row.created_at,
      userId: row.user_id,
      ...people.get(row.user_id)!,
      side: row.side,
      action: row.action,
      documentId: row.dr_document_id,
      documentName: documentNames.get(row.dr_document_id) ?? null,
      folderId: row.dr_folder_id,
      folderName: foldersById.get(String(row.dr_folder_id))?.name ?? null,
      faqEntryId: row.faq_entry_id,
      faqQuestion: faqEntriesById.get(String(row.faq_entry_id))?.question ?? null,
      faqEntryRemoved:
        faqEntriesById.get(String(row.faq_entry_id))?.status === 'unpublished',
      faqFileId: row.faq_file_id,
      faqFileName: faqFileNames.get(row.faq_file_id) ?? null,
      payload: row.payload,
    })),
    ...asks.flatMap((ask) =>
      ask.created_by
        ? [
            {
              kind:
                ask.kind === 'ask'
                  ? ('request_opened' as const)
                  : ('form_uploaded' as const),
              id: ask.id,
              at: ask.created_at,
              userId: ask.created_by,
              ...people.get(ask.created_by)!,
              side: sides.get(ask.created_by)!,
              ...askReference(ask.id),
            },
          ]
        : [],
    ),
    ...messages.map((message) => ({
      kind: 'reply' as const,
      id: message.id,
      at: message.created_at,
      userId: message.author_user_id,
      ...people.get(message.author_user_id)!,
      side: message.side,
      ...askReference(message.ask_id),
    })),
    ...threadFiles.map((file) => ({
      kind: 'thread_file' as const,
      id: file.id,
      at: file.created_at,
      userId: file.added_by,
      ...(file.added_by
        ? people.get(file.added_by)!
        : { email: null, name: null, isRemoved: false }),
      side: file.added_by ? sides.get(file.added_by)! : ('internal' as const),
      ...askReference(file.ask_id),
      documentId: file.dr_document_id,
      documentName: threadFileNames.get(file.dr_document_id) ?? null,
      role: file.role,
    })),
    ...uploads.map((upload) => ({
      kind: 'file_uploaded' as const,
      id: upload.id,
      at: upload.created_at!,
      userId: upload.uploaded_by,
      ...people.get(upload.uploaded_by)!,
      side: sides.get(upload.uploaded_by)!,
      documentId: upload.id,
      documentName: upload.name,
      folderId: upload.folder_id,
      folderName: foldersById.get(upload.folder_id)!.name,
    })),
  ];

  return entries.sort((a, b) => (a.at < b.at ? 1 : -1));
}

async function sidesByUser(
  client: Client,
  accountId: string,
  userIds: string[],
): Promise<Map<string, Enums['lender_side']>> {
  return new Map(
    await Promise.all(
      [...new Set(userIds)].map(async (userId) => {
        const { data: manages } = await client
          .rpc('has_permission', {
            user_id: userId,
            account_id: accountId,
            permission_name: 'deals.manage',
          })
          .throwOnError();

        return [userId, manages ? 'internal' : 'lender'] as const;
      }),
    ),
  );
}

export async function fetchSeenBy(
  client: Client,
  roomId: string,
): Promise<DocumentSeenBy[]> {
  const { data: rows } = await client
    .from('lender_room_activity')
    .select('created_at, user_id, side, action, dr_document_id')
    .eq('room_id', roomId)
    .in('action', ['document_previewed', 'document_downloaded'])
    .order('created_at')
    .throwOnError();

  const [people, documentNames] = await Promise.all([
    peopleById(client, roomId),
    namesById(
      client,
      'dr_document',
      rows.map((row) => row.dr_document_id),
    ),
  ]);

  const seen = new Map<string, DocumentSeenBy>();

  for (const row of rows) {
    const key = `${row.dr_document_id}:${row.user_id}`;
    const entry = seen.get(key) ?? {
      documentId: row.dr_document_id!,
      documentName: documentNames.get(row.dr_document_id) ?? null,
      userId: row.user_id,
      ...people.get(row.user_id)!,
      side: row.side,
      firstPreviewedAt: null,
      firstDownloadedAt: null,
    };

    if (row.action === 'document_previewed') {
      entry.firstPreviewedAt ??= row.created_at;
    } else {
      entry.firstDownloadedAt ??= row.created_at;
    }

    seen.set(key, entry);
  }

  return [...seen.values()];
}

async function namesById(
  client: Client,
  table: 'dr_document' | 'dr_folder' | 'lender_faq_file',
  ids: (string | null)[],
): Promise<Map<string | null, string>> {
  const { data } = await client
    .from(table)
    .select('id, name')
    .in('id', [...new Set(ids.filter((id) => id !== null))])
    .throwOnError();

  return new Map(data.map((row) => [row.id, row.name]));
}

async function peopleById(client: Client, roomId: string) {
  const [{ data: people }, { data: members }, { data: removals }] =
    await Promise.all([
      client.rpc('lender_room_people', { room_id: roomId }).throwOnError(),
      client
        .from('lender_room_member')
        .select('user_id')
        .eq('room_id', roomId)
        .throwOnError(),
      client
        .from('lender_room_removed_member')
        .select('user_id')
        .eq('room_id', roomId)
        .throwOnError(),
    ]);

  const current = new Set(members.map((member) => member.user_id));
  const removed = new Set(removals.map((removal) => removal.user_id));

  return new Map<
    string | null,
    { email: string; name: string | null; isRemoved: boolean }
  >(
    people.map((person) => [
      person.user_id,
      {
        email: person.email,
        name: person.name,
        isRemoved:
          removed.has(person.user_id) && !current.has(person.user_id),
      },
    ]),
  );
}
