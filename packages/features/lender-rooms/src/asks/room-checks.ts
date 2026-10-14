import type { Tables, TablesUpdate } from '@odb/supabase';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { Refusal } from '../actions/refusal';
import { type AskMove, type MoveWording, transitionAsk } from './transition';

type SavedAsk = Pick<
  Tables<'lender_ask'>,
  'id' | 'status' | 'first_response_at'
>;

export async function assertRoomMember(roomId: string) {
  const { data: isMember } = await getSupabaseServerClient()
    .rpc('is_lender_room_member', { room_id: roomId })
    .throwOnError();

  if (!isMember) {
    throw new Refusal('You are not a member of this lender room');
  }
}

export async function assertRoomShowsDocuments(
  roomId: string,
  documentIds: string[],
) {
  const client = getSupabaseServerClient();

  for (const documentId of documentIds) {
    const { data: isShown } = await client
      .rpc('lender_room_shows_document', {
        room_id: roomId,
        document_id: documentId,
      })
      .throwOnError();

    if (!isShown) {
      throw new Refusal('That document is not in this lender room');
    }
  }
}

export async function saveLenderMove(
  ask: SavedAsk,
  kind: Extract<AskMove, { side: 'lender' }>['kind'],
  wording: Pick<
    TablesUpdate<'lender_ask'>,
    'title' | 'body' | 'return_route'
  > = {},
  moveWording?: MoveWording,
) {
  const { status } = transitionAsk(
    ask,
    { side: 'lender', kind },
    new Date().toISOString(),
    moveWording,
  );

  let update = getSupabaseServerAdminClient()
    .from('lender_ask')
    .update({ status, ...wording })
    .eq('id', ask.id)
    .eq('status', ask.status);

  if (kind === 'edit' || kind === 'withdraw') {
    update = update.is('first_response_at', null);
  }

  const { data: saved } = await update.select('id').throwOnError();

  if (saved.length === 0) {
    throw new Refusal(
      'This changed while you were working. Reload and try again.',
    );
  }
}

export async function saveOurMove(
  ask: SavedAsk,
  kind: Extract<AskMove, { side: 'internal' }>['kind'],
  moveWording?: MoveWording,
) {
  await getSupabaseServerClient()
    .from('lender_ask')
    .update(
      transitionAsk(
        ask,
        { side: 'internal', kind },
        new Date().toISOString(),
        moveWording,
      ),
    )
    .eq('id', ask.id)
    .select('id')
    .single()
    .throwOnError();
}

export async function loadFolderTree(dealId: string) {
  const { data: folders } = await getSupabaseServerClient()
    .from('dr_folder')
    .select('id, parent_id')
    .eq('deal_id', dealId)
    .throwOnError();

  const parentOf = new Map(
    folders.map((folder) => [folder.id, folder.parent_id]),
  );

  return {
    isWithin(folderId: string, rootFolderId: string) {
      let ancestorId: string | null | undefined = folderId;
      while (ancestorId && ancestorId !== rootFolderId) {
        ancestorId = parentOf.get(ancestorId);
      }

      return Boolean(ancestorId);
    },
  };
}

export async function assertInRoomFolder(
  roomId: string,
  documentIds: string[],
) {
  const client = getSupabaseServerClient();

  const { data: room } = await client
    .from('lender_room')
    .select('deal_id, private_folder_id')
    .eq('id', roomId)
    .single()
    .throwOnError();

  const { data: documents } = await client
    .from('dr_document')
    .select('id, folder_id')
    .in('id', documentIds)
    .throwOnError();

  const folderTree = await loadFolderTree(room.deal_id);
  const folderOf = new Map(
    documents.map((document) => [document.id, document.folder_id]),
  );

  for (const documentId of documentIds) {
    const folderId = folderOf.get(documentId);

    if (!folderId || !folderTree.isWithin(folderId, room.private_folder_id)) {
      throw new Refusal("That file is not in the lender room's own folder");
    }
  }
}
