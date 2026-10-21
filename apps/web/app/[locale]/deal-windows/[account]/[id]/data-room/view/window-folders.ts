import type { SupabaseClient } from '@supabase/supabase-js';

import {
  buildFolderTree,
  fetchDocuments,
  fetchFolders,
  type FolderNode,
  groupDocumentsByFolder,
} from '@odb/data-room';
import type { Database } from '@odb/supabase';

import type { WindowFolder } from '../../../../../home/_components/data-room-window';

export async function loadWindowFolders(
  client: SupabaseClient<Database>,
  dealId: string,
): Promise<WindowFolder[]> {
  const [folders, documents] = await Promise.all([
    fetchFolders(client, dealId),
    fetchDocuments(client, dealId),
  ]);
  const filesByFolder = new Map(
    groupDocumentsByFolder(folders, documents).map((group) => [
      group.folderId,
      group.documents,
    ]),
  );
  const toWindowFolder = (node: FolderNode): WindowFolder => ({
    id: node.id,
    name: node.name,
    files: filesByFolder
      .get(node.id)!
      .map(({ id, name, version }) => ({ id, name, version })),
    folders: node.children.map(toWindowFolder),
  });

  return buildFolderTree(folders).map(toWindowFolder);
}
