import { z } from 'zod';

import {
  buildFolderTree,
  documentType,
  type DocumentRow,
  type FolderNode,
  type FolderRow,
} from '@odb/data-room';
import type { Tables } from '@odb/supabase';

export type VisitMark = 'new' | 'seen';

export interface HiddenMark {
  direct: boolean;
  inherited: boolean;
}

export interface RoomFileVersion {
  documentId: string;
  version: number;
  createdAt: string;
}

export interface RoomFile extends RoomFileVersion {
  kind: 'file';
  folderId: string;
  name: string;
  type: string;
  visitMark: VisitMark;
  earlierVersions: RoomFileVersion[];
}

export interface MarkedRoomFile extends RoomFile {
  hidden: HiddenMark;
}

export interface OversizeFile {
  kind: 'oversize';
  id: string;
  folderId: string;
  name: string;
  type: string;
  sizeBytes: number;
  createdAt: string;
}

export type RoomEntry = RoomFile | OversizeFile;

export type MarkedRoomEntry = MarkedRoomFile | OversizeFile;

export interface RoomFolder {
  id: string;
  name: string;
  folders: RoomFolder[];
  entries: RoomEntry[];
}

export interface MarkedRoomFolder {
  id: string;
  name: string;
  hidden: HiddenMark;
  folders: MarkedRoomFolder[];
  entries: MarkedRoomEntry[];
}

export interface RoomListing {
  master: RoomFolder | null;
  private: RoomFolder | null;
}

export interface MarkedRoomListing {
  master: MarkedRoomFolder | null;
  private: MarkedRoomFolder | null;
}

export type RoomSort = 'name' | 'date' | 'type';

export interface RoomListingSource {
  roots: { master_folder_id: string | null; private_folder_id: string | null };
  folders: FolderRow[];
  documents: DocumentRow[];
  oversize: Tables<'lender_oversize_file'>[];
  hidden: Tables<'lender_room_hidden'>[];
  ownUploadIds: string[];
  since: string | null;
}

export function buildRoomListing(source: RoomListingSource): MarkedRoomListing {
  const fileKey = (file: { folderId: string; name: string }) =>
    `${file.folderId}/${file.name}`;
  const hiddenIds = new Set(
    source.hidden.map((row) => row.dr_folder_id ?? row.dr_document_id),
  );
  const hiddenFiles = new Set(
    source.documents
      .filter((document) => hiddenIds.has(document.id))
      .map((document) =>
        fileKey({ folderId: document.folder_id, name: document.name }),
      ),
  );

  const files = new Map<string, Omit<RoomFile, 'hidden'>>();

  for (const document of source.documents.toSorted(
    (a, b) => b.version - a.version,
  )) {
    const version = {
      documentId: document.id,
      version: document.version,
      createdAt: z.string().parse(document.created_at),
    };
    const file = { folderId: document.folder_id, name: document.name };
    const latest = files.get(fileKey(file));

    if (latest) {
      latest.earlierVersions.push(version);
    } else {
      files.set(fileKey(file), {
        ...version,
        ...file,
        kind: 'file',
        type: documentType(document.name),
        visitMark: source.ownUploadIds.includes(document.id)
          ? 'seen'
          : visitMark(version.createdAt, source.since),
        earlierVersions: [],
      });
    }
  }

  const filesByFolder = Map.groupBy(files.values(), (file) => file.folderId);
  const oversizeByFolder = Map.groupBy(
    source.oversize,
    (row) => row.dr_folder_id,
  );

  const toFolder = (
    node: FolderNode,
    hideMarksApply: boolean,
    inherited: boolean,
  ): MarkedRoomFolder => {
    const hidden = {
      direct: hideMarksApply && hiddenIds.has(node.id),
      inherited,
    };
    const hidesContents = hidden.direct || inherited;

    return {
      id: node.id,
      name: node.name,
      hidden,
      folders: node.children.map((child) =>
        toFolder(child, hideMarksApply, hidesContents),
      ),
      entries: sortRoomEntries(
        [
          ...(filesByFolder.get(node.id) ?? []).map((file) => ({
            ...file,
            hidden: {
              direct: hideMarksApply && hiddenFiles.has(fileKey(file)),
              inherited: hidesContents,
            },
          })),
          ...(oversizeByFolder.get(node.id) ?? []).map(
            (row): OversizeFile => ({
              kind: 'oversize',
              id: row.id,
              folderId: row.dr_folder_id,
              name: row.name,
              type: documentType(row.name),
              sizeBytes: row.size_bytes,
              createdAt: row.created_at,
            }),
          ),
        ],
        'name',
      ),
    };
  };

  const nodes = withDescendants(buildFolderTree(source.folders));
  const root = (
    folderId: string | null,
    hideMarksApply: boolean,
  ): MarkedRoomFolder | null => {
    if (folderId === null) {
      return null;
    }

    const node = nodes.find((candidate) => candidate.id === folderId);

    if (!node) {
      throw new Error(`Room root folder ${folderId} is not readable`);
    }

    return toFolder(node, hideMarksApply, false);
  };

  return {
    master: root(source.roots.master_folder_id, true),
    private: root(source.roots.private_folder_id, false),
  };
}

export function lenderView(listing: MarkedRoomListing): RoomListing {
  return {
    master: listing.master && shownToLender(listing.master),
    private: listing.private && shownToLender(listing.private),
  };
}

function shownToLender({
  hidden: _hidden,
  folders,
  entries,
  ...folder
}: MarkedRoomFolder): RoomFolder {
  return {
    ...folder,
    folders: folders.filter((child) => !child.hidden.direct).map(shownToLender),
    entries: entries.flatMap((entry): RoomEntry[] => {
      if (entry.kind === 'oversize') {
        return [entry];
      }

      const { hidden, ...file } = entry;

      return hidden.direct ? [] : [file];
    }),
  };
}

const comparators: Record<RoomSort, (a: RoomEntry, b: RoomEntry) => number> = {
  name: (a, b) => a.name.localeCompare(b.name, 'en'),
  date: (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  type: (a, b) => a.type.localeCompare(b.type, 'en'),
};

export function sortRoomEntries<Entry extends RoomEntry>(
  entries: Entry[],
  by: RoomSort,
): Entry[] {
  return entries.toSorted(comparators[by]);
}

function visitMark(createdAt: string, since: string | null): VisitMark {
  return since === null || Date.parse(createdAt) > Date.parse(since)
    ? 'new'
    : 'seen';
}

function withDescendants(nodes: FolderNode[]): FolderNode[] {
  return nodes.flatMap((node) => [node, ...withDescendants(node.children)]);
}
