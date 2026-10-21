'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import {
  hideSellerRoomFolder,
  showSellerRoomFolder,
} from '@odb/seller-rooms/folders/actions.ts';
import type { RoomFolder } from '@odb/seller-rooms/folders/folder-showing.ts';

function inTreeOrder(
  folders: RoomFolder[],
): { folder: RoomFolder; depth: number }[] {
  const children = (parentId: string | null, depth: number) =>
    folders
      .filter((folder) => folder.parentId === parentId)
      .flatMap((folder): { folder: RoomFolder; depth: number }[] => [
        { folder, depth },
        ...children(folder.id, depth + 1),
      ]);

  return children(null, 0);
}

export function SellerRoomFolders({
  dealId,
  folders,
}: {
  dealId: string;
  folders: RoomFolder[];
}) {
  const router = useRouter();
  const [refusal, setRefusal] = useState<string | null>(null);

  async function toggle(folder: RoomFolder) {
    const change =
      folder.shown === 'picked' ? hideSellerRoomFolder : showSellerRoomFolder;
    const result = await change({ dealId, folderId: folder.id });

    setRefusal(result.ok ? null : result.refusal);
    router.refresh();
  }

  return (
    <fieldset className={'flex flex-col gap-1'}>
      <legend className={'text-sm font-medium'}>Folders sellers see</legend>
      {inTreeOrder(folders).map(({ folder, depth }) => (
        <label
          key={folder.id}
          className={'flex items-center gap-2 text-sm'}
          style={{ paddingLeft: `${depth * 1.25}rem` }}
        >
          <input
            type={'checkbox'}
            aria-label={`Show ${folder.name} to sellers`}
            checked={folder.shown !== 'hidden'}
            disabled={folder.shown === 'with-parent'}
            onChange={() => void toggle(folder)}
          />
          {folder.name}
        </label>
      ))}
      {refusal ? (
        <p role={'alert'} className={'text-destructive text-sm'}>
          {refusal}
        </p>
      ) : null}
    </fieldset>
  );
}
