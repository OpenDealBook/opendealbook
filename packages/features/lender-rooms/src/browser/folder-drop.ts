export interface DroppedItem {
  rootName: string;
  beneath: string[];
  file: File | null;
}

interface FolderDrop {
  rootName: string;
  paths: string[];
  files: { file: File; directory: string }[];
}

export function folderDrops(items: DroppedItem[]): {
  looseFiles: File[];
  folders: FolderDrop[];
} {
  const folders = new Map<string, FolderDrop>();
  const looseFiles: File[] = [];

  for (const { rootName, beneath, file } of items) {
    if (file && beneath.length === 0) {
      looseFiles.push(file);
      continue;
    }

    const folder = folders.get(rootName) ?? { rootName, paths: [], files: [] };

    folders.set(rootName, folder);

    if (!file) {
      if (beneath.length > 0) {
        folder.paths.push(beneath.join('/'));
      }
    } else if (!file.name.startsWith('.')) {
      folder.files.push({ file, directory: beneath.slice(0, -1).join('/') });
    }
  }

  return {
    looseFiles,
    folders: [...folders.values()].map((folder) => ({
      ...folder,
      paths: folder.paths.toSorted(),
    })),
  };
}

export function fileTargets(
  drop: FolderDrop,
  created: { rootFolderId: string | null; folderIds: Record<string, string> },
): { file: File; folderId: string }[] {
  return drop.files.flatMap(({ file, directory }) => {
    const folderId =
      created.rootFolderId === null
        ? undefined
        : directory === ''
          ? created.rootFolderId
          : created.folderIds[directory];

    return folderId ? [{ file, folderId }] : [];
  });
}
