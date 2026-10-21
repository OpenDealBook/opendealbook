import type { DroppedItem } from './folder-drop';

function isFileEntry(entry: FileSystemEntry): entry is FileSystemFileEntry {
  return entry.isFile;
}

function isDirectoryEntry(
  entry: FileSystemEntry,
): entry is FileSystemDirectoryEntry {
  return entry.isDirectory;
}

async function childrenOf(
  directory: FileSystemDirectoryEntry,
): Promise<FileSystemEntry[]> {
  const reader = directory.createReader();
  const children: FileSystemEntry[] = [];

  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((found, failed) =>
      reader.readEntries(found, failed),
    );

    if (batch.length === 0) {
      return children;
    }

    children.push(...batch);
  }
}

async function readBeneath(
  entry: FileSystemEntry,
  rootName: string,
  beneath: string[],
): Promise<DroppedItem[]> {
  if (isFileEntry(entry)) {
    return [
      {
        rootName,
        beneath,
        file: await new Promise<File>((found, failed) =>
          entry.file(found, failed),
        ),
      },
    ];
  }

  if (!isDirectoryEntry(entry)) {
    throw new Error(`${entry.name} is neither a file nor a folder`);
  }

  const children = await Promise.all(
    (await childrenOf(entry)).map((child) =>
      readBeneath(child, rootName, [...beneath, child.name]),
    ),
  );

  return [{ rootName, beneath, file: null }, ...children.flat()];
}

export async function readDropped(
  entries: FileSystemEntry[],
): Promise<DroppedItem[]> {
  return (
    await Promise.all(
      entries.map((entry) => readBeneath(entry, entry.name, [])),
    )
  ).flat();
}
