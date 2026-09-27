import { describe, expect, it } from 'vitest';

import { buildFolderTree, type FolderRow } from './tree';

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

describe('buildFolderTree', () => {
  it('nests children under their parent', () => {
    const tree = buildFolderTree([
      folder({ id: 'root' }),
      folder({ id: 'child', parent_id: 'root' }),
      folder({ id: 'grandchild', parent_id: 'child' }),
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0]?.id).toBe('root');
    expect(tree[0]?.children[0]?.id).toBe('child');
    expect(tree[0]?.children[0]?.children[0]?.id).toBe('grandchild');
  });

  it('orders siblings by sort_order then name', () => {
    const tree = buildFolderTree([
      folder({ id: 'b', name: 'b', sort_order: 1 }),
      folder({ id: 'a', name: 'a', sort_order: 0 }),
      folder({ id: 'z', name: 'z', sort_order: null }),
      folder({ id: 'y', name: 'y', sort_order: null }),
    ]);

    expect(tree.map((node) => node.id)).toEqual(['a', 'b', 'y', 'z']);
  });

  it('treats a folder whose parent is absent as a root', () => {
    const tree = buildFolderTree([
      folder({ id: 'visible', parent_id: 'hidden' }),
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0]?.id).toBe('visible');
  });
});
