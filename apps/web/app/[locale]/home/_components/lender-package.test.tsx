// @vitest-environment jsdom
import { act } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  RoomFile,
  RoomFolder,
} from '@odb/lender-rooms/contents/listing.ts';

import { LenderPackage } from './lender-package';
import {
  alerts,
  attach,
  clearScreen,
  dialogText,
  fakeServer,
  linkTo,
  pageText,
  press,
  settle,
  show,
  type,
} from './lender-test-kit';

vi.mock(
  'next/navigation',
  async () => (await import('./lender-test-kit')).navigation,
);
vi.mock('@odb/lender-rooms/rooms/actions.ts', async () =>
  (await import('./lender-test-kit')).fakeActions('startLenderPackage'),
);
vi.mock('@odb/lender-rooms/uploads/package-actions.ts', async () =>
  (await import('./lender-test-kit')).fakeActions('removePackageFile'),
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
  '@odb/lender-rooms/viewer/file-viewer.tsx',
  async () => (await import('./lender-test-kit')).fakeViewer,
);
vi.mock(
  '@odb/supabase/client',
  async () =>
    (await import('@odb/lender-rooms/requests-ui/test-support/fake-room.ts'))
      .browserClient,
);

const DEAL = '1b0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11';

const summary: RoomFile = {
  kind: 'file',
  documentId: 'summary',
  folderId: 'pkg',
  name: 'Summary.pdf',
  type: 'pdf',
  version: 2,
  createdAt: '2026-10-01T09:00:00.000Z',
  visitMark: 'new',
  earlierVersions: [
    {
      documentId: 'summary-v1',
      version: 1,
      createdAt: '2026-09-01T09:00:00.000Z',
    },
  ],
};

const pkg: RoomFolder = {
  id: 'pkg',
  name: 'Lender package',
  folders: [{ id: 'financials', name: 'Financials', folders: [], entries: [] }],
  entries: [summary],
};

beforeEach(() => {
  fakeServer.reset();
  fakeServer.values.beginUpload = {
    uploadId: 'upload-1',
    path: 'p',
    token: 't',
  };
  fakeServer.values.registerUpload = ['doc-1'];
});

afterEach(clearScreen);

describe('the lender package on a deal', () => {
  it('starts the package before any room exists', async () => {
    fakeServer.values.startLenderPackage = 'pkg';
    show(<LenderPackage accountSlug={'team-one'} dealId={DEAL} pkg={null} />);

    expect(pageText()).toContain(
      'Lenders will see everything in it once their rooms are created',
    );

    await press('Start the lender package');

    expect(fakeServer.inputsTo('startLenderPackage')).toEqual([
      { dealId: DEAL },
    ]);
    expect(fakeServer.refreshes).toBe(1);
  });

  it('shows why the package could not be started', async () => {
    fakeServer.refusal = 'The lender package is only available on team deals';
    show(<LenderPackage accountSlug={'team-one'} dealId={DEAL} pkg={null} />);

    await press('Start the lender package');

    expect(alerts()).toEqual([
      'The lender package is only available on team deals',
    ]);
  });

  it('lists what is in the package without lender-only new badges', () => {
    show(<LenderPackage accountSlug={'team-one'} dealId={DEAL} pkg={pkg} />);

    expect(pageText()).toContain('Summary.pdf');
    expect(pageText()).toContain('Version 2');
    expect(pageText()).toContain('Financials');
    expect(pageText()).not.toMatch(/\bnew\b/i);
    expect(pageText()).toContain('Drop files here or use Add files');
  });

  it('opens a package file or an earlier version in the preview, with Download beside it', async () => {
    show(<LenderPackage accountSlug={'team-one'} dealId={DEAL} pkg={pkg} />);

    const files = `/home/team-one/deals/${DEAL}/lenders/package/files`;

    expect(linkTo('Download Summary.pdf')).toBe(
      `${files}/summary?disposition=download`,
    );
    expect(linkTo('Download version 1 of Summary.pdf')).toBe(
      `${files}/summary-v1?disposition=download`,
    );

    await press('Summary.pdf');

    expect(dialogText()).toContain(
      `Viewer showing Summary.pdf from ${files}/summary?disposition=preview`,
    );

    await press('Close');
    await press('Version 1');

    expect(dialogText()).toContain(
      `Viewer showing Summary.pdf from ${files}/summary-v1?disposition=preview`,
    );
  });

  it('removes a package file only after the team confirms', async () => {
    show(<LenderPackage accountSlug={'team-one'} dealId={DEAL} pkg={pkg} />);

    await press('Remove Summary.pdf');

    expect(dialogText()).toContain(
      'Remove Summary.pdf from the lender package?',
    );
    expect(dialogText()).toContain(
      'Every lender room stops showing it. Past views and downloads stay in the activity.',
    );
    expect(fakeServer.inputsTo('removePackageFile')).toEqual([]);

    await press('Remove file');

    expect(fakeServer.inputsTo('removePackageFile')).toEqual([
      { dealId: DEAL, documentId: 'summary' },
    ]);
    expect(fakeServer.refreshes).toBe(1);
  });

  it('shows why a package file could not be removed', async () => {
    fakeServer.refusal = 'That file is not in the lender package';
    show(<LenderPackage accountSlug={'team-one'} dealId={DEAL} pkg={pkg} />);

    await press('Remove Summary.pdf');
    await press('Remove file');

    expect(alerts()).toEqual(['That file is not in the lender package']);
  });

  it('adds files at the top of the package', async () => {
    show(<LenderPackage accountSlug={'team-one'} dealId={DEAL} pkg={pkg} />);

    await attach('Add files', 'appraisal.pdf');
    await settle();
    await settle();

    expect(fakeServer.inputsTo('beginUpload')).toEqual([
      { dealId: DEAL, folderId: 'pkg', name: 'appraisal.pdf', size: 1 },
    ]);
    expect(fakeServer.refreshes).toBeGreaterThan(0);
  });

  it('adds files and folders inside a package folder', async () => {
    show(<LenderPackage accountSlug={'team-one'} dealId={DEAL} pkg={pkg} />);

    await attach('Upload into Financials', 'p-and-l.pdf');
    await settle();
    await press('New folder in Financials');
    await type('Folder name', '2026');
    await press('Create folder');

    expect(fakeServer.inputsTo('beginUpload')).toMatchObject([
      { dealId: DEAL, folderId: 'financials', name: 'p-and-l.pdf' },
    ]);
    expect(fakeServer.inputsTo('createFolder')).toEqual([
      { dealId: DEAL, parentFolderId: 'financials', name: '2026' },
    ]);
  });

  it('creates a folder at the top of the package and shows a refusal as given', async () => {
    fakeServer.refusal =
      'The lender package has reached its limit of 5,000 folders';
    show(<LenderPackage accountSlug={'team-one'} dealId={DEAL} pkg={pkg} />);

    await press('New folder');
    await type('Folder name', 'Closing');
    await press('Create folder');

    expect(fakeServer.inputsTo('createFolder')).toEqual([
      { dealId: DEAL, parentFolderId: 'pkg', name: 'Closing' },
    ]);
    expect(alerts()).toContain(
      'The lender package has reached its limit of 5,000 folders',
    );
  });

  it('recreates a dropped folder structure in the package', async () => {
    fakeServer.values.createFolderTree = {
      rootFolderId: 'new-root',
      folderIds: {},
    };
    show(<LenderPackage accountSlug={'team-one'} dealId={DEAL} pkg={pkg} />);

    const emptyFolder = {
      isFile: false,
      isDirectory: true,
      name: 'Diligence',
      createReader: () => ({
        readEntries: (found: (entries: unknown[]) => void) => found([]),
      }),
    };
    const drop = Object.assign(new Event('drop', { bubbles: true }), {
      dataTransfer: {
        items: [{ webkitGetAsEntry: (): unknown => emptyFolder }],
      },
    });

    await act(async () => {
      document.querySelector('[data-entry="Financials"]')!.dispatchEvent(drop);
    });
    await settle();
    await settle();

    expect(fakeServer.inputsTo('createFolderTree')).toEqual([
      {
        dealId: DEAL,
        parentFolderId: 'financials',
        rootName: 'Diligence',
        paths: [],
      },
    ]);
  });
});
