import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { folderShowing, type RoomFolder } from './folder-showing';

export async function loadSellerRoomFolders(
  client: SupabaseClient<Database>,
  dealId: string,
): Promise<RoomFolder[]> {
  const [
    { data: folders },
    { data: room },
    { data: lenderRooms },
    { data: lenderPackage },
    { data: counselFolders },
    { data: sellerCounselFolders },
  ] = await Promise.all([
    client
      .from('dr_folder')
      .select('id, parent_id, name')
      .eq('deal_id', dealId)
      .order('name')
      .throwOnError(),
    client
      .from('seller_room')
      .select('uploads_folder_id, seller_room_folder(dr_folder_id)')
      .eq('deal_id', dealId)
      .maybeSingle()
      .throwOnError(),
    client
      .from('lender_room')
      .select('private_folder_id')
      .eq('deal_id', dealId)
      .throwOnError(),
    client
      .from('lender_package')
      .select('master_folder_id')
      .eq('deal_id', dealId)
      .maybeSingle()
      .throwOnError(),
    getSupabaseServerAdminClient()
      .from('counsel_uploads_folder')
      .select('folder_id')
      .eq('deal_id', dealId)
      .throwOnError(),
    getSupabaseServerAdminClient()
      .from('seller_counsel_folder')
      .select('folder_id')
      .eq('deal_id', dealId)
      .throwOnError(),
  ]);

  const keptFromSellerRoots = new Set([
    ...lenderRooms.map((lenderRoom) => lenderRoom.private_folder_id),
    ...(lenderPackage ? [lenderPackage.master_folder_id] : []),
    ...[...counselFolders, ...sellerCounselFolders].map(
      (counselFolder) => counselFolder.folder_id,
    ),
  ]);
  const parentOf = new Map(
    folders.map((folder) => [folder.id, folder.parent_id]),
  );
  const keptFromSeller = (folderId: string | null): boolean =>
    folderId !== null &&
    (keptFromSellerRoots.has(folderId) ||
      keptFromSeller(parentOf.get(folderId) ?? null));

  return folderShowing(
    folders.filter(
      (folder) =>
        folder.id !== room?.uploads_folder_id && !keptFromSeller(folder.id),
    ),
    new Set(room?.seller_room_folder.map((picked) => picked.dr_folder_id)),
  );
}
