import {
  buildFolderTree,
  type DocumentRow,
  documentType,
  type FolderNode,
  type FolderRow,
} from '@odb/data-room';

export interface FileVersion {
  id: string;
  version: number;
  storagePath: string;
  uploadedAt: string | null;
  uploadedBy: string | null;
}

export interface IndexedFile extends FileVersion {
  index: string;
  name: string;
  type: string;
  earlier: FileVersion[];
}

export interface IndexedFolder {
  index: string;
  id: string;
  name: string;
  folders: IndexedFolder[];
  files: IndexedFile[];
}

function byNameThenNewest(a: DocumentRow, b: DocumentRow): number {
  return a.name.localeCompare(b.name) || b.version - a.version;
}

function versionOf(document: DocumentRow): FileVersion {
  return {
    id: document.id,
    version: document.version,
    storagePath: document.storage_path,
    uploadedAt: document.created_at,
    uploadedBy: document.uploaded_by,
  };
}

export function indexDataRoom(
  folders: FolderRow[],
  documents: DocumentRow[],
): IndexedFolder[] {
  const filesByFolder = Map.groupBy(
    Map.groupBy(
      documents.toSorted(byNameThenNewest),
      (document) => `${document.folder_id}/${document.name}`,
    ).values(),
    ([latest]) => latest!.folder_id,
  );

  const toIndexed = (node: FolderNode, index: string): IndexedFolder => {
    const files = filesByFolder.get(node.id) ?? [];

    return {
      index,
      id: node.id,
      name: node.name,
      folders: node.children.map((child, position) =>
        toIndexed(child, `${index}.${position + 1}`),
      ),
      files: files.map(([latest, ...earlier], position) => ({
        ...versionOf(latest!),
        index: `${index}.${node.children.length + position + 1}`,
        name: latest!.name,
        type: documentType(latest!.name),
        earlier: earlier.map(versionOf),
      })),
    };
  };

  return buildFolderTree(folders).map((node, position) =>
    toIndexed(node, String(position + 1)),
  );
}
