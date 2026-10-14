import { describe, expect, it } from 'vitest';

import type {
  OversizeFile,
  RoomEntry,
  RoomFile,
  RoomFolder,
} from '../contents/listing';
import {
  filesUnder,
  findFolder,
  newFileCount,
  type RoomPlaces,
  uploadDestination,
} from './room-places';


function file(
  folderId: string,
  name: string,
  visitMark: RoomFile['visitMark'] = 'seen',
): RoomFile {
  return {
    kind: 'file',
    documentId: `${folderId}/${name}`,
    version: 1,
    createdAt: '2026-10-01T00:00:00Z',
    folderId,
    name,
    type: 'PDF',
    visitMark,
    earlierVersions: [],
  };
}

function oversize(folderId: string, name: string): OversizeFile {
  return {
    kind: 'oversize',
    id: `${folderId}/${name}`,
    folderId,
    name,
    type: 'ZIP',
    sizeBytes: 400 * 1024 * 1024,
    createdAt: '2026-10-01T00:00:00Z',
  };
}

function folder(
  id: string,
  entries: RoomEntry[] = [],
  folders: RoomFolder[] = [],
): RoomFolder {
  return { id, name: id, folders, entries };
}

const places: RoomPlaces = {
  shared: folder(
    'package',
    [file('package', 'teaser.pdf', 'new')],
    [
      folder(
        'financials',
        [file('financials', 'p-and-l.pdf'), oversize('financials', 'ledger.zip')],
        [folder('tax', [file('tax', '2024.pdf', 'new'), file('tax', '2025.pdf', 'new')])],
      ),
      folder('legal'),
    ],
  ),
  own: folder('own', [], [folder('forms', [file('forms', 'application.pdf')])]),
};

describe('findFolder', () => {
  it('gives the breadcrumb path from the shared package root down to a nested folder', () => {
    const location = findFolder(places, 'tax');

    expect(location!.place).toBe('shared');
    expect(location!.folder.id).toBe('tax');
    expect(location!.path.map((step) => step.id)).toEqual([
      'package',
      'financials',
      'tax',
    ]);
  });

  it('places a folder of the private tree in the own space', () => {
    const location = findFolder(places, 'forms');

    expect(location!.place).toBe('own');
    expect(location!.path.map((step) => step.id)).toEqual(['own', 'forms']);
  });

  it('gives a root a path of itself', () => {
    expect(findFolder(places, 'own')!.path.map((step) => step.id)).toEqual([
      'own',
    ]);
  });
});

describe('uploadDestination', () => {
  it('sends uploads to the folder open inside the own space', () => {
    expect(
      uploadDestination({
        place: 'own',
        currentFolderId: 'forms',
        ownFolderId: 'own',
      }),
    ).toEqual({ folderId: 'forms', offersOwnSpace: false });
  });

  it('never targets the shared package: it offers the own space root instead', () => {
    expect(
      uploadDestination({
        place: 'shared',
        currentFolderId: 'financials',
        ownFolderId: 'own',
      }),
    ).toEqual({ folderId: 'own', offersOwnSpace: true });
  });
});

describe('newFileCount', () => {
  it('counts new files in a folder and everything beneath it', () => {
    expect(newFileCount(places.shared)).toBe(3);
    expect(newFileCount(places.shared.folders[0]!)).toBe(2);
  });

  it('is zero for a folder holding only seen files', () => {
    expect(newFileCount(places.own)).toBe(0);
  });
});

describe('filesUnder', () => {
  it('lists every stored file beneath a folder, leaving oversize placeholders out', () => {
    expect(filesUnder(places.shared).map((entry) => entry.name)).toEqual([
      'teaser.pdf',
      'p-and-l.pdf',
      '2024.pdf',
      '2025.pdf',
    ]);
  });
});

describe('findFolder for a folder the room no longer shows', () => {
  it('finds nothing', () => {
    expect(findFolder(places, 'withdrawn')).toBeNull();
  });
});
