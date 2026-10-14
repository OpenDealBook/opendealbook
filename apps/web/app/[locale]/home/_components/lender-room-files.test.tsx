// @vitest-environment jsdom
import { act } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  DocumentSeenBy,
  RoomActivityEntry,
} from '@odb/lender-rooms/activity/queries.ts';
import type {
  MarkedRoomFile,
  MarkedRoomFolder,
} from '@odb/lender-rooms/contents/listing.ts';

import { LenderRoomActivity } from './lender-room-activity';
import { LenderRoomFiles } from './lender-room-files';
import {
  alerts,
  attach,
  buttonNames,
  choose,
  clearScreen,
  dialogText,
  linkTo,
  pageText,
  press,
  fakeServer,
  settle,
  show,
  type,
} from './lender-test-kit';

vi.mock(
  'next/navigation',
  async () => (await import('./lender-test-kit')).navigation,
);
vi.mock('@odb/lender-rooms/contents/hide-actions.ts', async () =>
  (await import('./lender-test-kit')).fakeActions(
    'hideForRoom',
    'unhideForRoom',
  ),
);
vi.mock('@odb/lender-rooms/uploads/folder-actions.ts', async () =>
  (await import('./lender-test-kit')).fakeActions(
    'createFolder',
    'createFolderTree',
  ),
);
vi.mock('@odb/lender-rooms/uploads/actions.ts', async () =>
  (await import('./lender-test-kit')).fakeActions(
    'beginUpload',
    'registerUpload',
    'cancelUpload',
  ),
);
vi.mock(
  '@odb/supabase/client',
  async () =>
    (await import('@odb/lender-rooms/requests-ui/test-support/fake-room.ts'))
      .browserClient,
);

vi.mock(
  '@odb/lender-rooms/viewer/file-viewer.tsx',
  async () => (await import('./lender-test-kit')).fakeViewer,
);

const ROOM = '7d0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11';
const shown = { direct: false, inherited: false };

function file(
  name: string,
  documentId: string,
  extra: Partial<MarkedRoomFile> = {},
): MarkedRoomFile {
  return {
    kind: 'file',
    documentId,
    folderId: 'folder',
    name,
    type: 'pdf',
    version: 1,
    createdAt: '2026-10-01T09:00:00.000Z',
    visitMark: 'seen',
    hidden: shown,
    earlierVersions: [],
    ...extra,
  };
}

const master: MarkedRoomFolder = {
  id: 'master',
  name: 'Lender package',
  hidden: shown,
  folders: [
    {
      id: 'financials',
      name: 'Financials',
      hidden: shown,
      folders: [],
      entries: [
        file('Tax return.pdf', 'tax-v2', {
          version: 2,
          earlierVersions: [
            {
              documentId: 'tax-v1',
              version: 1,
              createdAt: '2026-09-01T09:00:00.000Z',
            },
          ],
        }),
      ],
    },
    {
      id: 'legal',
      name: 'Legal',
      hidden: { direct: true, inherited: false },
      folders: [],
      entries: [
        file('Lease.pdf', 'lease', {
          hidden: { direct: false, inherited: true },
        }),
      ],
    },
  ],
  entries: [
    file('Summary.pdf', 'summary', {
      hidden: { direct: true, inherited: false },
    }),
  ],
};

const own: MarkedRoomFolder = {
  id: 'own',
  name: 'First Bank',
  hidden: shown,
  folders: [
    {
      id: 'appraisals',
      name: 'Appraisals',
      hidden: shown,
      folders: [],
      entries: [],
    },
  ],
  entries: [
    file('Term sheet draft.pdf', 'term-sheet'),
    {
      kind: 'oversize',
      id: 'oversize-1',
      folderId: 'own',
      name: 'Site video.mov',
      type: 'mov',
      sizeBytes: 400 * 1024 * 1024,
      createdAt: '2026-10-01T09:00:00.000Z',
    },
  ],
};

const seenBy: DocumentSeenBy[] = [
  {
    documentId: 'term-sheet',
    documentName: 'Term sheet draft.pdf',
    userId: 'user-zac',
    email: 'zac@buyer.com',
    name: null,
    isRemoved: false,
    side: 'internal',
    firstPreviewedAt: '2026-10-11T10:00:00.000Z',
    firstDownloadedAt: null,
  },
  {
    documentId: 'tax-v2',
    documentName: 'Tax return.pdf',
    userId: 'user-ana',
    email: 'ana@firstbank.com',
    name: 'Ana Diaz',
    isRemoved: false,
    side: 'lender',
    firstPreviewedAt: '2026-10-12T10:00:00.000Z',
    firstDownloadedAt: '2026-10-13T11:00:00.000Z',
  },
  {
    documentId: 'tax-v2',
    documentName: 'Tax return.pdf',
    userId: 'user-zac',
    email: 'zac@buyer.com',
    name: null,
    isRemoved: false,
    side: 'internal',
    firstPreviewedAt: '2026-10-11T10:00:00.000Z',
    firstDownloadedAt: null,
  },
  {
    documentId: 'tax-v1',
    documentName: 'Tax return.pdf',
    userId: 'user-raj',
    email: 'raj@firstbank.com',
    name: null,
    isRemoved: true,
    side: 'lender',
    firstPreviewedAt: null,
    firstDownloadedAt: '2026-09-02T10:00:00.000Z',
  },
];

function rowOf(name: string): string {
  const row = [...document.querySelectorAll('[data-entry]')].find(
    (each) => each.getAttribute('data-entry') === name,
  );

  return (row?.textContent ?? '').replace(/\s+/g, ' ');
}

function showFiles() {
  show(
    <LenderRoomFiles
      roomId={ROOM}
      listing={{ master, private: own }}
      seenBy={seenBy}
    />,
  );
}

beforeEach(() => {
  fakeServer.reset();
});

afterEach(clearScreen);

describe('room files as the deal team sees them', () => {
  it('hides a master folder or file from this lender', async () => {
    showFiles();

    await press('Hide Financials from this lender');
    await press('Hide Tax return.pdf from this lender');

    expect(fakeServer.inputsTo('hideForRoom')).toEqual([
      { roomId: ROOM, target: { kind: 'folder', id: 'financials' } },
      { roomId: ROOM, target: { kind: 'document', id: 'tax-v2' } },
    ]);
    expect(fakeServer.refreshes).toBe(2);
  });

  it('marks what is hidden and shows it to the lender again', async () => {
    showFiles();

    expect(rowOf('Summary.pdf')).toContain('Hidden from this lender');
    expect(rowOf('Legal')).toContain('Hidden from this lender');
    expect(rowOf('Lease.pdf')).toContain('Hidden with its folder');
    expect(rowOf('Tax return.pdf')).not.toContain('Hidden');

    await press('Show Summary.pdf to this lender');
    await press('Show Legal to this lender');

    expect(fakeServer.inputsTo('unhideForRoom')).toEqual([
      { roomId: ROOM, target: { kind: 'document', id: 'summary' } },
      { roomId: ROOM, target: { kind: 'folder', id: 'legal' } },
    ]);
  });

  it('offers no hiding for the package itself or the room own folder', () => {
    showFiles();

    expect(buttonNames()).not.toContain('Hide Lender package from this lender');
    expect(buttonNames()).not.toContain(
      'Hide Term sheet draft.pdf from this lender',
    );
  });

  it('says who has seen each file, with the deal team labeled internal', () => {
    showFiles();

    const taxReturn = rowOf('Tax return.pdf');

    expect(taxReturn).toContain('ana@firstbank.com');
    expect(taxReturn).toMatch(
      /Ana Diaz \(ana@firstbank\.com\) previewed .*Oct 12, 2026.* downloaded .*Oct 13, 2026/,
    );
    expect(taxReturn).toMatch(
      /zac@buyer\.com Internal previewed .*Oct 11, 2026/,
    );
    expect(taxReturn).not.toContain('Not seen by the lender yet');
    expect(rowOf('Summary.pdf')).toContain('Not seen by the lender yet');
  });

  it('keeps a file unseen by the lender when only the deal team has looked at it', () => {
    showFiles();

    const termSheet = rowOf('Term sheet draft.pdf');

    expect(termSheet).toMatch(/zac@buyer\.com Internal previewed/);
    expect(termSheet).toContain('Not seen by the lender yet');
  });

  it('greys out a file that was too large to store', () => {
    showFiles();

    expect(rowOf('Site video.mov')).toContain('too large to store');
  });

  it('lists earlier versions with their own downloads and viewers', () => {
    showFiles();

    const taxReturn = rowOf('Tax return.pdf');

    expect(taxReturn).toContain('Version 2');
    expect(taxReturn).toContain('1 earlier version');
    expect(taxReturn).toMatch(
      /Version 1.*raj@firstbank\.com \(removed\) downloaded .*Sep 2, 2026/,
    );
    expect(linkTo('Download Tax return.pdf')).toBe(
      `/lender/${ROOM}/files/tax-v2?disposition=download`,
    );
    expect(linkTo('Download version 1 of Tax return.pdf')).toBe(
      `/lender/${ROOM}/files/tax-v1?disposition=download`,
    );
  });

  it('opens a file or an earlier version in the tracked in-browser preview', async () => {
    showFiles();

    await press('Tax return.pdf');

    expect(dialogText()).toContain(
      `Viewer showing Tax return.pdf from /lender/${ROOM}/files/tax-v2?disposition=preview`,
    );

    await press('Close');
    await press('Version 1');

    expect(dialogText()).toContain(
      `Viewer showing Tax return.pdf from /lender/${ROOM}/files/tax-v1?disposition=preview`,
    );
  });

  it('links a session that ended to the normal sign-in page', async () => {
    fakeServer.refusal = 'Your session has ended. Sign in again.';
    showFiles();

    await press('Hide Financials from this lender');

    expect(linkTo('Your session has ended. Sign in again.')).toBe(
      '/auth/sign-in',
    );
  });

  it('uploads into the room own folder', async () => {
    fakeServer.values.beginUpload = {
      uploadId: 'upload-1',
      path: 'p',
      token: 't',
    };
    fakeServer.values.registerUpload = ['doc-1'];
    showFiles();

    await attach('Upload files', 'memo.pdf');
    await settle();
    await settle();

    expect(fakeServer.inputsTo('beginUpload')).toEqual([
      { roomId: ROOM, folderId: 'own', name: 'memo.pdf', size: 1 },
    ]);
    expect(fakeServer.inputsTo('registerUpload')).toEqual([
      { uploadId: 'upload-1', keepAsZip: false },
    ]);
    expect(fakeServer.refreshes).toBeGreaterThan(0);
  });
});

describe('folders in the room own space', () => {
  beforeEach(() => {
    fakeServer.values.beginUpload = {
      uploadId: 'upload-1',
      path: 'p',
      token: 't',
    };
    fakeServer.values.registerUpload = ['doc-1'];
  });

  it('creates a folder at the top of the room own space', async () => {
    showFiles();

    await press('New folder');
    await type('Folder name', 'Closing documents');
    await press('Create folder');

    expect(fakeServer.inputsTo('createFolder')).toEqual([
      { roomId: ROOM, parentFolderId: 'own', name: 'Closing documents' },
    ]);
  });

  it('creates a folder inside another and uploads into it', async () => {
    showFiles();

    await press('New folder in Appraisals');
    await type('Folder name', '2026');
    await press('Create folder');
    await attach('Upload into Appraisals', 'appraisal.pdf');
    await settle();
    await settle();

    expect(fakeServer.inputsTo('createFolder')).toEqual([
      { roomId: ROOM, parentFolderId: 'appraisals', name: '2026' },
    ]);
    expect(fakeServer.inputsTo('beginUpload')).toEqual([
      { roomId: ROOM, folderId: 'appraisals', name: 'appraisal.pdf', size: 1 },
    ]);
  });

  it('recreates a dropped folder structure and uploads its files into it', async () => {
    fakeServer.values.createFolderTree = {
      rootFolderId: 'new-root',
      folderIds: { Leases: 'new-leases' },
    };
    showFiles();

    const fileEntry = (name: string) => ({
      isFile: true,
      isDirectory: false,
      name,
      file: (found: (file: File) => void) => found(new File(['x'], name)),
    });
    const directoryEntry = (name: string, children: unknown[]) => ({
      isFile: false,
      isDirectory: true,
      name,
      createReader: () => {
        let batches = [children, []];

        return {
          readEntries: (found: (entries: unknown[]) => void) => {
            const [next, ...rest] = batches;

            batches = rest;
            found(next ?? []);
          },
        };
      },
    });
    const dropped = directoryEntry('Diligence', [
      fileEntry('summary.pdf'),
      directoryEntry('Leases', [fileEntry('lease.pdf')]),
    ]);
    const drop = Object.assign(new Event('drop', { bubbles: true }), {
      dataTransfer: { items: [{ webkitGetAsEntry: () => dropped }] },
    });

    await act(async () => {
      document.querySelector('[data-drop-zone]')!.dispatchEvent(drop);
    });
    await settle();
    await settle();
    await settle();

    expect(fakeServer.inputsTo('createFolderTree')).toEqual([
      {
        roomId: ROOM,
        parentFolderId: 'own',
        rootName: 'Diligence',
        paths: ['Leases'],
      },
    ]);
    expect(
      fakeServer
        .inputsTo('beginUpload')
        .map((input) => input as { folderId: string; name: string })
        .map(({ folderId, name }) => `${folderId}/${name}`)
        .toSorted(),
    ).toEqual(['new-leases/lease.pdf', 'new-root/summary.pdf']);
  });

  it('puts what is dropped onto a folder into that folder', async () => {
    fakeServer.values.createFolderTree = {
      rootFolderId: 'new-root',
      folderIds: {},
    };
    showFiles();

    const emptyFolder = {
      isFile: false,
      isDirectory: true,
      name: '2026',
      createReader: () => ({
        readEntries: (found: (entries: unknown[]) => void) => found([]),
      }),
    };
    const drop = Object.assign(new Event('drop', { bubbles: true }), {
      dataTransfer: {
        items: [
          { webkitGetAsEntry: (): unknown => emptyFolder },
          {
            webkitGetAsEntry: (): null => null,
            getAsFile: () => new File(['x'], 'loose.pdf'),
          },
        ],
      },
    });

    await act(async () => {
      document.querySelector('[data-entry="Appraisals"]')!.dispatchEvent(drop);
    });
    await settle();
    await settle();

    expect(fakeServer.inputsTo('createFolderTree')).toEqual([
      {
        roomId: ROOM,
        parentFolderId: 'appraisals',
        rootName: '2026',
        paths: [],
      },
    ]);
    expect(fakeServer.inputsTo('beginUpload')).toMatchObject([
      { folderId: 'appraisals', name: 'loose.pdf' },
    ]);
  });

  it('says something went wrong when adding a dropped folder crashes, without trying again', async () => {
    fakeServer.crashing = ['createFolderTree'];
    showFiles();

    const drop = Object.assign(new Event('drop', { bubbles: true }), {
      dataTransfer: {
        items: [
          {
            webkitGetAsEntry: (): unknown => ({
              isFile: false,
              isDirectory: true,
              name: 'Diligence',
              createReader: () => ({
                readEntries: (found: (entries: unknown[]) => void) => found([]),
              }),
            }),
          },
        ],
      },
    });

    await act(async () => {
      document.querySelector('[data-drop-zone]')!.dispatchEvent(drop);
    });
    await settle();
    await settle();

    expect(alerts()).toHaveLength(1);
    expect(fakeServer.inputsTo('createFolderTree')).toHaveLength(1);
  });

  it('holds a zip until the team says whether to keep it as one file', async () => {
    showFiles();

    await attach('Upload files', 'bundle.zip');
    await settle();
    await settle();

    expect(fakeServer.inputsTo('registerUpload')).toEqual([]);

    await choose('Keep this zip as one file');
    await press('Add to room');
    await settle();

    expect(fakeServer.inputsTo('registerUpload')).toEqual([
      { uploadId: 'upload-1', keepAsZip: true },
    ]);
  });

  it('shows why a dropped folder was refused', async () => {
    showFiles();
    fakeServer.refusal = 'This room has reached its limit of 5,000 folders';

    const drop = Object.assign(new Event('drop', { bubbles: true }), {
      dataTransfer: {
        items: [
          {
            webkitGetAsEntry: (): unknown => ({
              isFile: false,
              isDirectory: true,
              name: 'Diligence',
              createReader: () => ({
                readEntries: (found: (entries: unknown[]) => void) => found([]),
              }),
            }),
          },
        ],
      },
    });

    await act(async () => {
      document.querySelector('[data-drop-zone]')!.dispatchEvent(drop);
    });
    await settle();

    expect(alerts()).toContain(
      'This room has reached its limit of 5,000 folders',
    );

    await press('Dismiss');

    expect(alerts()).toEqual([]);
  });
});

const entry: RoomActivityEntry = {
  kind: 'recorded',
  id: 'a1',
  at: '2026-10-12T10:00:00.000Z',
  userId: 'user-ana',
  email: 'ana@firstbank.com',
  name: null,
  isRemoved: false,
  side: 'lender',
  action: 'document_previewed',
  documentId: 'tax-v2',
  documentName: 'Tax return.pdf',
  folderId: null,
  folderName: null,
  payload: null,
};

const ROOM_PATH = `/home/team-one/deals/deal-1/lenders/${ROOM}`;
const origin = {
  at: '2026-10-12T10:00:00.000Z',
  userId: 'user-ana',
  email: 'ana@firstbank.com',
  name: 'Ana Diaz',
  isRemoved: false,
  side: 'lender' as const,
};

function activityRows(entries: RoomActivityEntry[]) {
  show(
    <LenderRoomActivity roomId={ROOM} roomPath={ROOM_PATH} entries={entries} />,
  );

  return [...document.querySelectorAll('tbody tr')].map((row) =>
    (row.textContent ?? '').replace(/\s+/g, ' '),
  );
}

describe('room activity', () => {
  it('shows person, action, item and time, labeling the deal team internal', () => {
    const rows = activityRows([
      entry,
      {
        ...entry,
        id: 'a2',
        email: 'zac@buyer.com',
        side: 'internal',
        action: 'folder_opened',
        documentId: null,
        documentName: null,
        folderId: 'financials',
        folderName: 'Financials',
      },
      {
        ...entry,
        id: 'a3',
        action: 'zip_downloaded',
        documentId: null,
        documentName: null,
      },
    ]);

    expect(rows[0]).toMatch(
      /ana@firstbank\.com.*Previewed.*Tax return\.pdf.*Oct 12, 2026/,
    );
    expect(rows[0]).not.toContain('Internal');
    expect(rows[1]).toMatch(
      /zac@buyer\.com.*Internal.*Opened folder.*Financials/,
    );
    expect(rows[2]).toContain('Downloaded a zip');
  });

  it('shows requests, replies, forms and uploads, each linked to its thread or file', async () => {
    const ask = {
      askId: 'ask-1',
      askKind: 'ask' as const,
      askTitle: 'Rent roll',
    };
    const form = { askId: 'form-1', askKind: 'form' as const, askTitle: 'PFS' };

    const rows = activityRows([
      { ...origin, ...ask, kind: 'request_opened', id: 'b1', isRemoved: true },
      { ...origin, ...ask, kind: 'reply', id: 'b2' },
      { ...origin, ...form, kind: 'form_uploaded', id: 'b3' },
      {
        ...origin,
        kind: 'file_uploaded',
        id: 'b4',
        documentId: 'doc-7',
        documentName: 'Appraisal.pdf',
        folderId: 'appraisals',
        folderName: 'Appraisals',
      },
    ]);

    expect(rows[0]).toMatch(
      /Ana Diaz \(ana@firstbank\.com\) \(removed\).*Opened a request.*Rent roll/,
    );
    expect(rows[1]).toMatch(
      /Ana Diaz \(ana@firstbank\.com\).*Replied.*Rent roll/,
    );
    expect(rows[1]).not.toContain('(removed)');
    expect(rows[2]).toMatch(/Uploaded a form.*PFS/);
    expect(rows[3]).toMatch(/Uploaded a file.*Appraisal\.pdf/);
    expect(linkTo('Rent roll')).toBe(`${ROOM_PATH}/requests/asks/ask-1`);
    expect(linkTo('PFS')).toBe(`${ROOM_PATH}/requests/forms/form-1`);
  });

  it('shows a file added to a thread with the thread it belongs to', () => {
    const rows = activityRows([
      {
        ...origin,
        kind: 'thread_file',
        id: 'c1',
        side: 'internal',
        email: 'zac@buyer.com',
        name: null,
        askId: 'form-1',
        askKind: 'form',
        askTitle: 'PFS',
        documentId: 'doc-8',
        documentName: 'PFS completed.pdf',
        role: 'completed_form',
      },
      {
        ...origin,
        kind: 'thread_file',
        id: 'c2',
        askId: 'ask-1',
        askKind: 'ask',
        askTitle: 'Rent roll',
        documentId: 'doc-9',
        documentName: null,
        role: 'attachment',
      },
      {
        ...origin,
        kind: 'thread_file',
        id: 'c3',
        side: 'internal',
        userId: null,
        email: null,
        name: null,
        askId: 'form-1',
        askKind: 'form',
        askTitle: 'PFS',
        documentId: 'doc-10',
        documentName: 'PFS signed.pdf',
        role: 'signed_form',
      },
    ]);

    expect(rows[2]).toMatch(/Filed automatically.*Filed the signed form/);

    expect(rows[0]).toMatch(
      /zac@buyer\.com.*Internal.*Returned a completed form.*PFS completed\.pdf.*PFS/,
    );
    expect(rows[1]).toMatch(/Attached a file.*Rent roll/);
    expect(linkTo('Download PFS completed.pdf')).toBe(
      `/lender/${ROOM}/files/doc-8?disposition=download`,
    );
  });

  it('opens an uploaded file in the preview', async () => {
    activityRows([
      {
        ...origin,
        kind: 'file_uploaded',
        id: 'b4',
        documentId: 'doc-7',
        documentName: 'Appraisal.pdf',
        folderId: 'appraisals',
        folderName: 'Appraisals',
      },
    ]);

    await press('Appraisal.pdf');

    expect(dialogText()).toContain(
      `Viewer showing Appraisal.pdf from /lender/${ROOM}/files/doc-7?disposition=preview`,
    );
  });

  it('says so when nothing has happened yet', () => {
    expect(activityRows([])).toEqual([]);
    expect(pageText()).toContain('Nothing has happened in this room yet');
  });
});
