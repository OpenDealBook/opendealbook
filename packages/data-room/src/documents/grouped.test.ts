import { describe, expect, it } from 'vitest';

import type { FolderRow } from '../folders/tree';
import {
  type DocumentRow,
  documentType,
  groupDocumentsByFolder,
} from './grouped';

function folder(
  overrides: Partial<FolderRow> & Pick<FolderRow, 'id'>,
): FolderRow {
  return {
    account_id: 'acct',
    deal_id: 'deal',
    parent_id: null,
    name: overrides.id,
    sort_order: null,
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

function doc(
  overrides: Partial<DocumentRow> & Pick<DocumentRow, 'id' | 'folder_id'>,
): DocumentRow {
  return {
    account_id: 'acct',
    deal_id: 'deal',
    name: overrides.id,
    storage_path: `deal/deal/${overrides.id}`,
    version: 1,
    uploaded_by: null,
    checklist_item_id: null,
    created_at: null,
    updated_at: null,
    removed_at: null,
    ...overrides,
  };
}

describe('documentType', () => {
  it('returns the uppercased extension', () => {
    expect(documentType('balance.pdf')).toBe('PDF');
    expect(documentType('photo.JPG')).toBe('JPG');
  });

  it('falls back to FILE when there is no usable extension', () => {
    expect(documentType('README')).toBe('FILE');
    expect(documentType('.gitignore')).toBe('FILE');
    expect(documentType('trailing.')).toBe('FILE');
  });
});

describe('groupDocumentsByFolder', () => {
  it('groups documents under their folder in folder-tree order with a breadcrumb path', () => {
    const groups = groupDocumentsByFolder(
      [
        folder({ id: 'finance', name: 'Finance', sort_order: 0 }),
        folder({ id: 'legal', name: 'Legal', sort_order: 1 }),
        folder({
          id: 'taxes',
          name: 'Taxes',
          parent_id: 'finance',
        }),
      ],
      [
        doc({ id: 'd1', folder_id: 'finance', name: 'p&l.xlsx' }),
        doc({ id: 'd2', folder_id: 'taxes', name: 'return.pdf' }),
      ],
    );

    expect(groups.map((group) => group.folderId)).toEqual([
      'finance',
      'taxes',
      'legal',
    ]);
    expect(groups[1]?.path).toBe('Finance / Taxes');
    expect(groups[0]?.documents.map((document) => document.name)).toEqual([
      'p&l.xlsx',
    ]);
    expect(groups[1]?.documents[0]?.type).toBe('PDF');
  });

  it('keeps a folder with no documents as an empty group', () => {
    const groups = groupDocumentsByFolder([folder({ id: 'empty' })], []);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.documents).toEqual([]);
  });

  it('orders documents by name ascending then version descending', () => {
    const groups = groupDocumentsByFolder(
      [folder({ id: 'f' })],
      [
        doc({ id: 'a', folder_id: 'f', name: 'apa.pdf', version: 1 }),
        doc({ id: 'b', folder_id: 'f', name: 'apa.pdf', version: 3 }),
        doc({ id: 'c', folder_id: 'f', name: 'loi.pdf', version: 1 }),
      ],
    );

    expect(
      groups[0]?.documents.map((document) => [document.name, document.version]),
    ).toEqual([
      ['apa.pdf', 3],
      ['apa.pdf', 1],
      ['loi.pdf', 1],
    ]);
  });
});
