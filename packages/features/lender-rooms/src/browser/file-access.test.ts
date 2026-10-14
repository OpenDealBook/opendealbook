import { describe, expect, it } from 'vitest';

import type { RoomEntry } from '../contents/listing';
import { fileSize, fileUrl, neighbours, zipDownloadForm } from './file-access';

const ROOM = '7d0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11';

function file(documentId: string): RoomEntry {
  return {
    kind: 'file',
    documentId,
    version: 1,
    createdAt: '2026-10-01T00:00:00Z',
    folderId: 'folder',
    name: `${documentId}.pdf`,
    type: 'PDF',
    visitMark: 'seen',

    earlierVersions: [],
  };
}

function oversize(id: string): RoomEntry {
  return {
    kind: 'oversize',
    id,
    folderId: 'folder',
    name: `${id}.zip`,
    type: 'ZIP',
    sizeBytes: 1,
    createdAt: '2026-10-01T00:00:00Z',
  };
}

describe('fileUrl', () => {
  it('points at the tracked route with the disposition', () => {
    expect(
      fileUrl({ roomId: ROOM, documentId: 'doc-1', disposition: 'preview' }),
    ).toBe(`/lender/${ROOM}/files/doc-1?disposition=preview`);
    expect(
      fileUrl({ roomId: ROOM, documentId: 'doc-1', disposition: 'download' }),
    ).toBe(`/lender/${ROOM}/files/doc-1?disposition=download`);
  });
});

describe('fileUrl for the deal team', () => {
  it('points at the lender package route of the deal with the disposition', () => {
    expect(
      fileUrl({
        accountSlug: 'harbor-capital',
        dealId: 'deal-1',
        documentId: 'doc-1',
        disposition: 'preview',
      }),
    ).toBe(
      '/home/harbor-capital/deals/deal-1/lenders/package/files/doc-1?disposition=preview',
    );
  });
});

describe('zipDownloadForm', () => {
  it('posts one documentIds field per selected file to the room zip route', () => {
    expect(zipDownloadForm(ROOM, ['doc-1', 'doc-2', 'doc-3'])).toEqual({
      action: `/lender/${ROOM}/files/zip`,
      fields: [
        { name: 'documentIds', value: 'doc-1' },
        { name: 'documentIds', value: 'doc-2' },
        { name: 'documentIds', value: 'doc-3' },
      ],
    });
  });
});

describe('neighbours', () => {
  const entries = [file('a'), oversize('huge'), file('b'), file('c')];

  it('steps over an oversize placeholder to the next file that can be opened', () => {
    const { previous, next } = neighbours(entries, 'a');

    expect(previous).toBeNull();
    expect(next?.documentId).toBe('b');
  });

  it('steps back over an oversize placeholder', () => {
    const { previous, next } = neighbours(entries, 'b');

    expect(previous?.documentId).toBe('a');
    expect(next?.documentId).toBe('c');
  });

  it('has nothing after the last file', () => {
    expect(neighbours(entries, 'c').next).toBeNull();
  });
});

describe('fileSize', () => {
  it('names the size in the units the upload limit uses', () => {
    expect(fileSize(412 * 1024 * 1024)).toBe('412 MiB');
    expect(fileSize(1.5 * 1024 * 1024 * 1024)).toBe('1.5 GiB');
  });
});
