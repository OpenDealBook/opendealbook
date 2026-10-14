import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

import { fetchDocuments, fetchFolders, type FolderRow } from '@odb/data-room';
import type { Database } from '@odb/supabase';

import { Refusal } from '../actions/refusal';
import { packageRoot } from '../uploads/access';
import { buildRoomListing, lenderView, type RoomFolder } from './listing';

export async function loadPackageListing(
  client: SupabaseClient<Database>,
  dealId: string,
): Promise<RoomFolder | null> {
  const root = await packageRoot(dealId).catch((error: unknown) => {
    if (error instanceof Refusal) {
      return null;
    }

    throw error;
  });

  if (!root) {
    return null;
  }

  const [folders, documents] = await Promise.all([
    fetchFolders(client, dealId),
    fetchDocuments(client, dealId),
  ]);
  const { data: oversize } = await client
    .from('lender_oversize_file')
    .select('*')
    .in('dr_folder_id', subtreeIds(folders, root.masterFolderId))
    .throwOnError();

  return lenderView(
    buildRoomListing({
      roots: { master_folder_id: root.masterFolderId, private_folder_id: null },
      folders,
      documents,
      oversize,
      hidden: [],
      ownUploadIds: [],
      since: null,
    }),
  ).master;
}

function subtreeIds(folders: FolderRow[], rootId: string): string[] {
  const children = Map.groupBy(folders, (folder) => folder.parent_id);
  const walk = (id: string): string[] => [
    id,
    ...(children.get(id) ?? []).flatMap((child) => walk(child.id)),
  ];

  return walk(rootId);
}
