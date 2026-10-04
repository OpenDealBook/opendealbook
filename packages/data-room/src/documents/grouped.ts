import type { Tables } from '@odb/supabase';

import { buildFolderTree, type FolderNode, type FolderRow } from '../folders/tree';

export type DocumentRow = Tables<'dr_document'>;

export interface BrowseDocument {
  id: string;
  name: string;
  type: string;
  version: number;
  storagePath: string;
  uploadedAt: string | null;
}

export interface FolderGroup {
  folderId: string;
  name: string;
  path: string;
  documents: BrowseDocument[];
}

export function documentType(name: string): string {
  const dot = name.lastIndexOf('.');

  if (dot <= 0 || dot === name.length - 1) {
    return 'FILE';
  }

  return name.slice(dot + 1).toUpperCase();
}

export function groupDocumentsByFolder(
  folders: FolderRow[],
  documents: DocumentRow[],
): FolderGroup[] {
  const byFolder = new Map<string, BrowseDocument[]>();

  for (const document of documents) {
    const list = byFolder.get(document.folder_id) ?? [];

    list.push({
      id: document.id,
      name: document.name,
      type: documentType(document.name),
      version: document.version,
      storagePath: document.storage_path,
      uploadedAt: document.created_at,
    });

    byFolder.set(document.folder_id, list);
  }

  const groups: FolderGroup[] = [];

  const walk = (nodes: FolderNode[], trail: string[]): void => {
    for (const node of nodes) {
      const path = [...trail, node.name];

      groups.push({
        folderId: node.id,
        name: node.name,
        path: path.join(' / '),
        documents: (byFolder.get(node.id) ?? []).sort(compareDocuments),
      });

      walk(node.children, path);
    }
  };

  walk(buildFolderTree(folders), []);

  return groups;
}

function compareDocuments(a: BrowseDocument, b: BrowseDocument): number {
  if (a.name !== b.name) {
    return a.name.localeCompare(b.name);
  }

  return b.version - a.version;
}
