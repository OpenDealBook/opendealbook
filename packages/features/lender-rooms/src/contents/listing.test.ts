import { describe, expect, it } from 'vitest';

import type { Tables } from '@odb/supabase';

import {
  buildRoomListing,
  lenderView,
  type MarkedRoomEntry,
  type MarkedRoomFolder,
  type RoomEntry,
  type RoomFolder,
  sortRoomEntries,
} from './listing';

const ROOM = 'room-1';
const ROOTS = { master_folder_id: 'master', private_folder_id: 'private' };

function folder(id: string, parentId: string | null): Tables<'dr_folder'> {
  return {
    id,
    parent_id: parentId,
    name: id,
    account_id: 'account',
    deal_id: 'deal',
    sort_order: null,
    created_at: null,
    updated_at: null,
  };
}

function document(
  id: string,
  folderId: string,
  name: string,
  version: number,
  createdAt: string,
): Tables<'dr_document'> {
  return {
    id,
    folder_id: folderId,
    name,
    version,
    created_at: createdAt,
    account_id: 'account',
    deal_id: 'deal',
    storage_path: `deal/${id}`,
    checklist_item_id: null,
    removed_at: null,
    updated_at: null,
    uploaded_by: null,
  };
}

function hiddenFolder(id: string): Tables<'lender_room_hidden'> {
  return {
    id: `h-${id}`,
    room_id: ROOM,
    dr_folder_id: id,
    dr_document_id: null,
  };
}

function hiddenDocument(id: string): Tables<'lender_room_hidden'> {
  return {
    id: `h-${id}`,
    room_id: ROOM,
    dr_folder_id: null,
    dr_document_id: id,
  };
}

const FOLDERS = [
  folder('data-room-root', null),
  folder('master', 'data-room-root'),
  folder('financials', 'master'),
  folder('statements', 'financials'),
  folder('private', 'data-room-root'),
  folder('diligence', 'data-room-root'),
  folder('other-room', 'data-room-root'),
];

const DOCUMENTS = [
  document('cim-1', 'master', 'CIM.pdf', 1, '2026-01-01T00:00:00+00:00'),
  document('cim-3', 'master', 'CIM.pdf', 3, '2026-03-01T00:00:00+00:00'),
  document('cim-2', 'master', 'CIM.pdf', 2, '2026-02-01T00:00:00+00:00'),
  document('pnl-1', 'financials', 'pnl.xlsx', 1, '2026-01-15T00:00:00+00:00'),
  document(
    'bs-1',
    'statements',
    'Balance Sheet.docx',
    1,
    '2026-02-15T00:00:00+00:00',
  ),
  document(
    'term-1',
    'private',
    'Term sheet.pdf',
    1,
    '2026-02-20T00:00:00+00:00',
  ),
  document(
    'tax-1',
    'diligence',
    'tax-return.pdf',
    1,
    '2026-01-01T00:00:00+00:00',
  ),
  document(
    'other-1',
    'other-room',
    'for-other-lender.pdf',
    1,
    '2026-01-01T00:00:00+00:00',
  ),
];

function build(
  overrides: Partial<Parameters<typeof buildRoomListing>[0]> = {},
) {
  return buildRoomListing({
    roots: ROOTS,
    folders: FOLDERS,
    documents: DOCUMENTS,
    oversize: [],
    hidden: [],
    ownUploadIds: [],
    since: null,
    ...overrides,
  });
}

function entriesUnder(root: RoomFolder | null): RoomEntry[] {
  if (!root) {
    return [];
  }

  return [...root.entries, ...root.folders.flatMap(entriesUnder)];
}

function markedEntriesUnder(root: MarkedRoomFolder | null): MarkedRoomEntry[] {
  if (!root) {
    return [];
  }

  return [...root.entries, ...root.folders.flatMap(markedEntriesUnder)];
}

function fileNamed(root: MarkedRoomFolder | null, name: string) {
  const entry = markedEntriesUnder(root).find(
    (candidate) => candidate.name === name,
  );

  if (entry?.kind !== 'file') {
    throw new Error(`no file named ${name}`);
  }

  return entry;
}

describe('buildRoomListing', () => {
  it('keeps only the master and private subtrees of the data room', () => {
    const listing = build();

    expect(listing.master?.id).toBe('master');
    expect(listing.master?.folders.map((child) => child.id)).toEqual([
      'financials',
    ]);
    expect(
      listing.master?.folders[0]?.folders.map((child) => child.id),
    ).toEqual(['statements']);
    expect(listing.private?.id).toBe('private');
    expect(
      [...entriesUnder(listing.master), ...entriesUnder(listing.private)]
        .map((entry) => entry.name)
        .sort(),
    ).toEqual(['Balance Sheet.docx', 'CIM.pdf', 'Term sheet.pdf', 'pnl.xlsx']);
  });

  it('has no master root when the deal has no package', () => {
    const listing = build({
      roots: { master_folder_id: null, private_folder_id: 'private' },
    });

    expect(listing.master).toBeNull();
  });

  it('has no private root when the room gives out no private folder', () => {
    const listing = build({
      roots: { master_folder_id: 'master', private_folder_id: null },
    });

    expect(listing.private).toBeNull();
  });

  it.each([
    { master_folder_id: 'missing', private_folder_id: 'private' },
    { master_folder_id: 'master', private_folder_id: 'missing' },
  ])('crashes when a root folder that is set cannot be found: %o', (roots) => {
    expect(() => build({ roots })).toThrow('Room root folder missing');
  });

  it('collapses same-named documents in a folder into one file showing the latest version', () => {
    expect(build().master?.entries).toEqual([
      expect.objectContaining({
        name: 'CIM.pdf',
        documentId: 'cim-3',
        version: 3,
        createdAt: '2026-03-01T00:00:00+00:00',
        folderId: 'master',
        type: 'PDF',
      }),
    ]);
  });

  it('lists the earlier versions of a file newest first', () => {
    expect(fileNamed(build().master, 'CIM.pdf').earlierVersions).toEqual([
      {
        documentId: 'cim-2',
        version: 2,
        createdAt: '2026-02-01T00:00:00+00:00',
      },
      {
        documentId: 'cim-1',
        version: 1,
        createdAt: '2026-01-01T00:00:00+00:00',
      },
    ]);
  });

  it('crashes on a document without a creation time', () => {
    expect(() =>
      build({
        documents: [
          {
            ...document('undated', 'master', 'undated.pdf', 1, ''),
            created_at: null,
          },
        ],
      }),
    ).toThrow();
  });

  it('keeps same-named documents in different folders as separate files', () => {
    const listing = build({
      documents: [
        ...DOCUMENTS,
        document(
          'cim-fin',
          'financials',
          'CIM.pdf',
          1,
          '2026-01-01T00:00:00+00:00',
        ),
      ],
    });

    expect(fileNamed(listing.master, 'CIM.pdf').earlierVersions).toHaveLength(
      2,
    );
    expect(
      listing.master?.folders[0]?.entries.map((entry) => entry.name),
    ).toEqual(['CIM.pdf', 'pnl.xlsx']);
  });

  it('marks a file new when its latest version was created after the last visit', () => {
    const listing = build({ since: '2026-02-10T00:00:00.000Z' });

    expect(fileNamed(listing.master, 'CIM.pdf').visitMark).toBe('new');
    expect(fileNamed(listing.master, 'Balance Sheet.docx').visitMark).toBe(
      'new',
    );
    expect(fileNamed(listing.master, 'pnl.xlsx').visitMark).toBe('seen');
  });

  it('marks every file new on a first-ever visit', () => {
    const listing = build({ since: null });

    expect(
      [...entriesUnder(listing.master), ...entriesUnder(listing.private)].map(
        (entry) => entry.kind === 'file' && entry.visitMark,
      ),
    ).toEqual(['new', 'new', 'new', 'new']);
  });

  it('does not mark a file new for an earlier version alone', () => {
    const listing = build({ since: '2026-03-15T00:00:00.000Z' });

    expect(fileNamed(listing.master, 'CIM.pdf').visitMark).toBe('seen');
  });

  it('marks a file the viewer uploaded themselves as seen even when it arrived after the last visit', () => {
    const listing = build({
      since: '2026-02-10T00:00:00.000Z',
      ownUploadIds: ['term-1'],
    });

    expect(fileNamed(listing.private, 'Term sheet.pdf').visitMark).toBe('seen');
  });

  it('marks a file someone else uploaded after the last visit as new', () => {
    const listing = build({
      since: '2026-02-10T00:00:00.000Z',
      ownUploadIds: ['pnl-1'],
    });

    expect(fileNamed(listing.private, 'Term sheet.pdf').visitMark).toBe('new');
  });

  it('marks a hidden folder as hidden directly and everything beneath it as hidden through an ancestor', () => {
    const listing = build({ hidden: [hiddenFolder('financials')] });
    const financials = listing.master?.folders[0];
    const direct = { direct: true, inherited: false };
    const inherited = { direct: false, inherited: true };
    const visible = { direct: false, inherited: false };

    expect(listing.master?.hidden).toEqual(visible);
    expect(financials?.hidden).toEqual(direct);
    expect(financials?.folders[0]?.hidden).toEqual(inherited);
    expect(fileNamed(listing.master, 'pnl.xlsx').hidden).toEqual(inherited);
    expect(fileNamed(listing.master, 'Balance Sheet.docx').hidden).toEqual(
      inherited,
    );
    expect(fileNamed(listing.master, 'CIM.pdf').hidden).toEqual(visible);
  });

  it('marks a file hidden directly when any of its versions is hidden', () => {
    const listing = build({ hidden: [hiddenDocument('cim-1')] });

    expect(fileNamed(listing.master, 'CIM.pdf').hidden).toEqual({
      direct: true,
      inherited: false,
    });
    expect(fileNamed(listing.master, 'pnl.xlsx').hidden).toEqual({
      direct: false,
      inherited: false,
    });
  });

  it('reports both marks for an item hidden itself inside a hidden folder', () => {
    const listing = build({
      hidden: [
        hiddenFolder('financials'),
        hiddenFolder('statements'),
        hiddenDocument('pnl-1'),
      ],
    });
    const both = { direct: true, inherited: true };

    expect(listing.master?.folders[0]?.folders[0]?.hidden).toEqual(both);
    expect(fileNamed(listing.master, 'pnl.xlsx').hidden).toEqual(both);
  });

  it('omits a directly hidden file from a lender viewer', () => {
    const listing = lenderView(
      build({
        hidden: [hiddenDocument('pnl-1')],
      }),
    );

    expect(entriesUnder(listing.master).map((entry) => entry.name)).toEqual([
      'CIM.pdf',
      'Balance Sheet.docx',
    ]);
  });

  it('omits a hidden folder and the files under it from a lender viewer', () => {
    const listing = lenderView(
      build({
        hidden: [hiddenFolder('financials')],
      }),
    );

    expect(listing.master?.folders).toEqual([]);
  });

  it('omits every version of a file from a lender viewer when one version is hidden', () => {
    const listing = lenderView(
      build({
        hidden: [hiddenDocument('cim-1')],
      }),
    );

    expect(listing.master?.entries).toEqual([]);
  });

  it('carries no hide marks in a lender view', () => {
    const listing = lenderView(
      build({ hidden: [hiddenFolder('statements'), hiddenDocument('cim-1')] }),
    );

    expect(JSON.stringify(listing)).not.toContain('hidden');
  });

  it('never marks private-root items hidden', () => {
    const listing = build({
      folders: [...FOLDERS, folder('private-sub', 'private')],
      hidden: [
        hiddenFolder('private'),
        hiddenFolder('private-sub'),
        hiddenDocument('term-1'),
      ],
    });
    const visible = { direct: false, inherited: false };

    expect(listing.private?.hidden).toEqual(visible);
    expect(listing.private?.folders[0]?.hidden).toEqual(visible);
    expect(fileNamed(listing.private, 'Term sheet.pdf').hidden).toEqual(
      visible,
    );
  });

  it('lists an oversize file in its folder as a too-large entry with name and size', () => {
    const listing = build({
      oversize: [
        {
          id: 'big-1',
          account_id: 'account',
          dr_folder_id: 'financials',
          name: 'ledger-export.csv',
          size_bytes: 400 * 1024 * 1024,
          created_at: '2026-02-01T00:00:00+00:00',
        },
        {
          id: 'big-elsewhere',
          account_id: 'account',
          dr_folder_id: 'diligence',
          name: 'not-in-room.csv',
          size_bytes: 400 * 1024 * 1024,
          created_at: '2026-02-01T00:00:00+00:00',
        },
      ],
    });

    expect(
      entriesUnder(listing.master).filter((entry) => entry.kind === 'oversize'),
    ).toEqual([
      {
        kind: 'oversize',
        id: 'big-1',
        folderId: 'financials',
        name: 'ledger-export.csv',
        type: 'CSV',
        sizeBytes: 400 * 1024 * 1024,
        createdAt: '2026-02-01T00:00:00+00:00',
      },
    ]);
  });
});

describe('sortRoomEntries', () => {
  const entries = [
    ...entriesUnder(build().master),
    ...entriesUnder(build().private),
  ];

  it('sorts by name', () => {
    expect(sortRoomEntries(entries, 'name').map((entry) => entry.name)).toEqual(
      ['Balance Sheet.docx', 'CIM.pdf', 'pnl.xlsx', 'Term sheet.pdf'],
    );
  });

  it('sorts by date of the latest version', () => {
    expect(sortRoomEntries(entries, 'date').map((entry) => entry.name)).toEqual(
      ['pnl.xlsx', 'Balance Sheet.docx', 'Term sheet.pdf', 'CIM.pdf'],
    );
  });

  it('sorts by type', () => {
    expect(sortRoomEntries(entries, 'type').map((entry) => entry.type)).toEqual(
      ['DOCX', 'PDF', 'PDF', 'XLSX'],
    );
  });
});
