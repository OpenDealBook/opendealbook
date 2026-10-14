import { describe, expect, it } from 'vitest';

import type { RoomFile, RoomFolder } from '../contents/listing';
import { selectionRange, selectionSummary, zipSelection } from './selection';

const order = ['a', 'b', 'c', 'd', 'e'];

describe('selectionRange', () => {
  it('covers everything from the anchor down to the target', () => {
    expect(selectionRange(order, 'b', 'd')).toEqual(['b', 'c', 'd']);
  });

  it('covers the same files when the target is above the anchor', () => {
    expect(selectionRange(order, 'd', 'b')).toEqual(['b', 'c', 'd']);
  });

  it('is the one file when anchor and target are the same', () => {
    expect(selectionRange(order, 'c', 'c')).toEqual(['c']);
  });
});


function file(name: string): RoomFile {
  return {
    kind: 'file',
    documentId: name,
    version: 1,
    createdAt: '2026-10-01T00:00:00Z',
    folderId: 'folder',
    name,
    type: 'PDF',
    visitMark: 'seen',
    earlierVersions: [],
  };
}

function folder(
  id: string,
  entries: RoomFolder['entries'],
  folders: RoomFolder[] = [],
): RoomFolder {
  return { id, name: id, folders, entries };
}

describe('zipSelection', () => {
  const tax = folder('tax', [file('2024.pdf')]);
  const financials = folder(
    'financials',
    [
      file('p-and-l.pdf'),
      {
        kind: 'oversize',
        id: 'ledger',
        folderId: 'financials',
        name: 'ledger.zip',
        type: 'ZIP',
        sizeBytes: 1,
        createdAt: '2026-10-01T00:00:00Z',
      },
    ],
    [tax],
  );

  it('takes every stored file beneath a selected folder, at any depth', () => {
    expect(zipSelection([], [financials])).toEqual(['p-and-l.pdf', '2024.pdf']);
  });

  it('downloads a file once when it is selected directly and through its folder', () => {
    expect(zipSelection(['2024.pdf', 'teaser.pdf'], [financials, tax])).toEqual([
      '2024.pdf',
      'teaser.pdf',
      'p-and-l.pdf',
    ]);
  });
});

describe('selectionSummary', () => {
  it('says what will download', () => {
    expect(selectionSummary({ files: 3, folders: 2 })).toBe(
      '3 files, 2 folders selected',
    );
    expect(selectionSummary({ files: 1, folders: 0 })).toBe('1 file selected');
    expect(selectionSummary({ files: 0, folders: 1 })).toBe(
      '1 folder selected',
    );
  });
});
