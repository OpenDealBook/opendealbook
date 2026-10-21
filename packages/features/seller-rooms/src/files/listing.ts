import type { SupabaseClient } from '@supabase/supabase-js';

import { fetchDocuments, fetchFolders } from '@odb/data-room';
import {
  buildRoomListing,
  lenderView,
  type RoomListing,
} from '@odb/lender-rooms/contents/listing.ts';
import type { Database } from '@odb/supabase';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

type Client = SupabaseClient<Database>;

const SAME_VISIT_WINDOW_MS = 30 * 60 * 1000;

// Sellers cannot read room activity, so a verified member's own visits and
// uploads are read with the service role.
async function lastVisit(admin: Client, roomId: string, userId: string) {
  const { data } = await admin
    .from('seller_room_activity')
    .select('created_at')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .eq('action', 'room_opened')
    .lt('created_at', new Date(Date.now() - SAME_VISIT_WINDOW_MS).toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
    .throwOnError();

  return data?.created_at ?? null;
}

export async function loadSellerRoomListing(
  client: Client,
  roomId: string,
): Promise<RoomListing> {
  const [{ data: room }, { data: member }, userResult] = await Promise.all([
    client
      .from('seller_room')
      .select('id, account_id, deal_id, uploads_folder_id')
      .eq('id', roomId)
      .single()
      .throwOnError(),
    client.rpc('is_seller_room_member', { room_id: roomId }).throwOnError(),
    client.auth.getUser(),
  ]);

  if (!member) {
    throw new Error('Only a member of the open room can list it');
  }

  const userId = userResult.data.user!.id;
  const admin = getSupabaseServerAdminClient();

  const [folders, documents, oversize, ownUploads, since] = await Promise.all([
    fetchFolders(client, room.deal_id),
    fetchDocuments(client, room.deal_id),
    client.from('lender_oversize_file').select('*').throwOnError(),
    admin
      .from('seller_upload')
      .select('document_ids')
      .eq('room_id', roomId)
      .eq('uploaded_by', userId)
      .throwOnError(),
    lastVisit(admin, roomId, userId),
  ]);

  const readable = new Set(folders.map((folder) => folder.id));
  const teamSide: (typeof folders)[number] = {
    id: room.id,
    account_id: room.account_id,
    deal_id: room.deal_id,
    parent_id: null,
    name: 'Shared',
    sort_order: null,
    created_at: null,
    updated_at: null,
  };

  const listing = buildRoomListing({
    roots: {
      master_folder_id: room.id,
      private_folder_id: room.uploads_folder_id,
    },
    folders: [
      teamSide,
      ...folders.map((folder) =>
        folder.id !== room.uploads_folder_id &&
        (!folder.parent_id || !readable.has(folder.parent_id))
          ? { ...folder, parent_id: room.id }
          : folder,
      ),
    ],
    documents,
    oversize: oversize.data,
    hidden: [],
    ownUploadIds: ownUploads.data.flatMap(
      (upload) => upload.document_ids ?? [],
    ),
    since,
  });

  return lenderView(listing);
}

export async function recordSellerRoomVisit(
  client: Client,
  admin: Client,
  roomId: string,
  folderId: string | null,
): Promise<void> {
  const [
    {
      data: { user },
    },
    { data: room },
  ] = await Promise.all([
    client.auth.getUser(),
    admin
      .from('seller_room')
      .select('account_id')
      .eq('id', roomId)
      .single()
      .throwOnError(),
  ]);

  await admin
    .from('seller_room_activity')
    .insert({
      room_id: roomId,
      account_id: room.account_id,
      user_id: user!.id,
      side: 'seller',
      action: folderId ? 'folder_opened' : 'room_opened',
      dr_folder_id: folderId,
    })
    .throwOnError();
}
