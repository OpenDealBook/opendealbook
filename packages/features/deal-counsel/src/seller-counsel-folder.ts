import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

type Client = SupabaseClient<Database>;

export interface SellerCounselFolderView {
  folders: { id: string; path: string }[];
  files: { documentId: string; name: string }[];
}

// The folder record is the server's alone; its files are read as the caller,
// so only the seller side ever gets any.
export async function loadSellerCounselFolder(
  client: Client,
  dealId: string,
): Promise<SellerCounselFolderView | null> {
  const [{ data: folder }, { data: folderIds }] = await Promise.all([
    getSupabaseServerAdminClient()
      .from('seller_counsel_folder')
      .select('folder_id')
      .eq('deal_id', dealId)
      .maybeSingle()
      .throwOnError(),
    client.rpc('seller_counsel_folder_ids').throwOnError(),
  ]);

  if (!folder) {
    return null;
  }

  const [{ data: folders }, { data: documents }] = await Promise.all([
    client
      .from('dr_folder')
      .select('id, parent_id, name')
      .eq('deal_id', dealId)
      .in('id', folderIds)
      .throwOnError(),
    client
      .from('dr_document')
      .select('id, name')
      .eq('deal_id', dealId)
      .in('folder_id', folderIds)
      .order('name')
      .throwOnError(),
  ]);

  const byId = new Map(folders.map((each) => [each.id, each]));
  const pathOf = (id: string): string => {
    const each = byId.get(id)!;

    return id === folder.folder_id
      ? each.name
      : `${pathOf(each.parent_id!)} / ${each.name}`;
  };

  return {
    folders: folders
      .map((each) => ({ id: each.id, path: pathOf(each.id) }))
      .toSorted((a, b) => a.path.localeCompare(b.path)),
    files: documents.map((document) => ({
      documentId: document.id,
      name: document.name,
    })),
  };
}
