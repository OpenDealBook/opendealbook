import type { RoomEntry, RoomFile, RoomFolder } from '../contents/listing';

export type Place = 'shared' | 'own';

export interface RoomPlaces {
  shared: RoomFolder;
  own: RoomFolder;
}

interface FolderLocation {
  place: Place;
  folder: RoomFolder;
  path: RoomFolder[];
}

type Found = Omit<FolderLocation, 'place'>;

function findUnder(folder: RoomFolder, folderId: string): Found | null {
  if (folder.id === folderId) {
    return { folder, path: [folder] };
  }

  for (const child of folder.folders) {
    const found = findUnder(child, folderId);

    if (found) {
      return { folder: found.folder, path: [folder, ...found.path] };
    }
  }

  return null;
}

export function findFolder(
  places: RoomPlaces,
  folderId: string,
): FolderLocation | null {
  const shared = findUnder(places.shared, folderId);

  if (shared) {
    return { place: 'shared', ...shared };
  }

  const own = findUnder(places.own, folderId);

  return own ? { place: 'own', ...own } : null;
}

export function uploadDestination(where: {
  place: Place;
  currentFolderId: string;
  ownFolderId: string;
}): { folderId: string; offersOwnSpace: boolean } {
  return where.place === 'own'
    ? { folderId: where.currentFolderId, offersOwnSpace: false }
    : { folderId: where.ownFolderId, offersOwnSpace: true };
}

export function entriesUnder(folder: RoomFolder): RoomEntry[] {
  return [...folder.entries, ...folder.folders.flatMap(entriesUnder)];
}

export function filesUnder(folder: RoomFolder): RoomFile[] {
  return entriesUnder(folder).filter((entry) => entry.kind === 'file');
}

export function newFileCount(folder: RoomFolder): number {
  return filesUnder(folder).filter((file) => file.visitMark === 'new').length;
}
