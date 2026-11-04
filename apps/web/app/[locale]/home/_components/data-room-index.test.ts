import { describe, expect, it } from 'vitest';

import type { DocumentRow, FolderRow } from '@odb/data-room';

import { indexDataRoom, type IndexedFolder } from './data-room-index';

function folder(
  id: string,
  name: string,
  parent_id: string | null = null,
  sort_order: number | null = null,
): FolderRow {
  return {
    id,
    name,
    parent_id,
    sort_order,
    account_id: 'acct',
    deal_id: 'deal',
    created_at: null,
    updated_at: null,
  };
}

function document(
  id: string,
  folder_id: string,
  name: string,
  version = 1,
): DocumentRow {
  return {
    id,
    folder_id,
    name,
    version,
    account_id: 'acct',
    deal_id: 'deal',
    storage_path: `deal/deal/${id}-${name}`,
    created_at: '2026-10-01T12:00:00Z',
    updated_at: null,
    removed_at: null,
    uploaded_by: 'user-1',
  };
}

function numbered(folders: IndexedFolder[]): string[] {
  return folders.flatMap((entry) => [
    `${entry.index} ${entry.name}`,
    ...numbered(entry.folders),
    ...entry.files.map(
      (file) =>
        `${file.index} ${file.name} v${[file.version, ...file.earlier.map((earlier) => earlier.version)].join(',')}`,
    ),
  ]);
}

describe('indexDataRoom', () => {
  it('numbers folders, subfolders, then files from their order', () => {
    const room = indexDataRoom(
      [
        folder('legal', 'Legal'),
        folder('fin', 'Financials'),
        folder('tax', 'Tax returns', 'fin'),
        folder('bank', 'Bank statements', 'fin'),
      ],
      [
        document('d1', 'fin', 'P&L 2025.xlsx'),
        document('d2', 'fin', 'Balance sheet.pdf'),
        document('d3', 'tax', '2024 return.pdf'),
        document('d4', 'legal', 'Lease.pdf'),
      ],
    );

    expect(numbered(room)).toEqual([
      '1 Financials',
      '1.1 Bank statements',
      '1.2 Tax returns',
      '1.2.1 2024 return.pdf v1',
      '1.3 Balance sheet.pdf v1',
      '1.4 P&L 2025.xlsx v1',
      '2 Legal',
      '2.1 Lease.pdf v1',
    ]);
  });

  it('follows the manual folder order when one exists', () => {
    const room = indexDataRoom(
      [folder('a', 'Alpha', null, 2), folder('z', 'Zulu', null, 1)],
      [],
    );

    expect(numbered(room)).toEqual(['1 Zulu', '2 Alpha']);
  });

  it('renumbers an item when it moves', () => {
    const folders = [folder('a', 'Alpha'), folder('b', 'Beta')];
    const before = indexDataRoom(folders, [document('d', 'a', 'Memo.pdf')]);
    const after = indexDataRoom(folders, [document('d', 'b', 'Memo.pdf')]);

    expect(numbered(before)).toContain('1.1 Memo.pdf v1');
    expect(numbered(after)).toContain('2.1 Memo.pdf v1');
  });

  it('gives each document one number for its latest version and keeps older versions under it', () => {
    const room = indexDataRoom(
      [folder('a', 'Alpha')],
      [
        document('v1', 'a', 'Lease.pdf', 1),
        document('v3', 'a', 'Lease.pdf', 3),
        document('v2', 'a', 'Lease.pdf', 2),
        document('m', 'a', 'Memo.pdf'),
      ],
    );

    expect(numbered(room)).toEqual([
      '1 Alpha',
      '1.1 Lease.pdf v3,2,1',
      '1.2 Memo.pdf v1',
    ]);
    expect(room[0]!.files[0]!.earlier.map((earlier) => earlier.id)).toEqual([
      'v2',
      'v1',
    ]);
  });
});
