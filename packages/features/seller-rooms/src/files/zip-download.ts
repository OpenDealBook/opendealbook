import type { SupabaseClient } from '@supabase/supabase-js';

import { z } from 'zod';

import {
  readZipRequest,
  zipEntryPaths,
  zipResponse,
} from '@odb/data-room/room-zip';
import { isOwnDealStoragePath } from '@odb/data-room/storage-path';
import { signedInUser } from '@odb/lender-rooms/activity/signed-in-user.ts';
import { storedSize } from '@odb/lender-rooms/uploads/objects.ts';
import type { Database } from '@odb/supabase';

type Client = SupabaseClient<Database>;

export async function respondToSellerZipRequest({
  client,
  admin,
  request,
  roomId,
}: {
  client: Client;
  admin: Client;
  request: Request;
  roomId: string;
}): Promise<Response> {
  const read = await readZipRequest(request);

  if (read instanceof Response) {
    return read;
  }

  if (!z.uuid().safeParse(roomId).success) {
    return new Response(null, { status: 400 });
  }

  const user = await signedInUser(client);

  if (!user) {
    return new Response(null, { status: 401 });
  }

  const [{ data: member }, { data: room }, { data: documents }] =
    await Promise.all([
      client.rpc('is_seller_room_member', { room_id: roomId }),
      client
        .from('seller_room')
        .select('account_id, deal_id, uploads_folder_id')
        .eq('id', roomId)
        .maybeSingle()
        .throwOnError(),
      client
        .from('dr_document')
        .select('id, deal_id, folder_id, name, storage_path')
        .in('id', read.documentIds)
        .throwOnError(),
    ]);

  if (
    !member ||
    !room ||
    documents.length !== read.documentIds.length ||
    !documents.every(
      (document) =>
        document.deal_id === room.deal_id && isOwnDealStoragePath(document),
    )
  ) {
    return new Response(null, { status: 404 });
  }

  const sizes = await Promise.all(
    documents.map((document) => storedSize(admin, document.storage_path)),
  );

  if (sizes.includes(null)) {
    return new Response(null, { status: 404 });
  }

  const [{ data: folderRows }, { data: rooms }] = await Promise.all([
    client
      .from('dr_folder')
      .select('id, parent_id, name')
      .eq('deal_id', room.deal_id)
      .throwOnError(),
    client.rpc('my_seller_rooms').eq('id', roomId).throwOnError(),
  ]);

  const visible = new Set(folderRows.map((folder) => folder.id));
  const folders = folderRows.map((folder) =>
    folder.id === room.uploads_folder_id
      ? { ...folder, name: 'Uploads' }
      : folder,
  );

  const entries = zipEntryPaths({
    documentIds: read.documentIds,
    documents,
    folders,
    roots: folders
      .filter((folder) => !folder.parent_id || !visible.has(folder.parent_id))
      .map((folder) => folder.id),
  });

  await admin
    .from('seller_room_activity')
    .insert({
      room_id: roomId,
      account_id: room.account_id,
      user_id: user.id,
      side: 'seller',
      action: 'zip_downloaded',
      payload: { document_ids: read.documentIds },
    })
    .throwOnError();

  return zipResponse(admin, entries, rooms[0]!.team_name);
}
