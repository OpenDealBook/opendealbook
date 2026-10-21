export interface RoomFolder {
  id: string;
  parentId: string | null;
  name: string;
  shown: 'picked' | 'with-parent' | 'hidden';
}

export function folderShowing(
  folders: { id: string; parent_id: string | null; name: string }[],
  picked: Set<string>,
): RoomFolder[] {
  const parentOf = new Map(
    folders.map((folder) => [folder.id, folder.parent_id]),
  );

  function underPicked(parentId: string | null): boolean {
    return (
      parentId !== null &&
      (picked.has(parentId) || underPicked(parentOf.get(parentId) ?? null))
    );
  }

  return folders.map((folder) => ({
    id: folder.id,
    parentId: folder.parent_id,
    name: folder.name,
    shown: picked.has(folder.id)
      ? 'picked'
      : underPicked(folder.parent_id)
        ? 'with-parent'
        : 'hidden',
  }));
}
