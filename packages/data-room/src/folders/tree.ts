import type { Tables } from '@tuckin/supabase';

export type FolderRow = Tables<'dr_folder'>;

export interface FolderNode extends FolderRow {
  children: FolderNode[];
}

export function buildFolderTree(rows: FolderRow[]): FolderNode[] {
  const nodes = new Map<string, FolderNode>();

  for (const row of rows) {
    nodes.set(row.id, { ...row, children: [] });
  }

  const roots: FolderNode[] = [];

  for (const node of nodes.values()) {
    const parent = node.parent_id ? nodes.get(node.parent_id) : undefined;

    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  sortLevel(roots);

  return roots;
}

function sortLevel(level: FolderNode[]): void {
  level.sort(compareFolders);

  for (const node of level) {
    sortLevel(node.children);
  }
}

function compareFolders(a: FolderNode, b: FolderNode): number {
  const orderA = a.sort_order ?? Number.MAX_SAFE_INTEGER;
  const orderB = b.sort_order ?? Number.MAX_SAFE_INTEGER;

  if (orderA !== orderB) {
    return orderA - orderB;
  }

  return a.name.localeCompare(b.name);
}
