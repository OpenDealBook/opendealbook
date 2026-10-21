'use client';

import { type DragEvent, useState } from 'react';

import { createFolderTree } from '../uploads/folder-actions';
import type { SpaceTarget } from '../uploads/targets';
import { type DroppedItem, fileTargets, folderDrops } from './folder-drop';
import { readDropped } from './read-dropped';

const UNREADABLE_DROP =
  'Some of what you dropped could not be read, so nothing was added. Try again, or add the files directly.';

export function useFolderDrop({
  space,
  startUploads,
  onFoldersCreated,
}: {
  space: SpaceTarget;
  startUploads: (files: File[], into: string) => void;
  onFoldersCreated: (count: number) => void;
}) {
  const [problems, setProblems] = useState<{ id: string; text: string }[]>([]);

  function report(texts: string[]) {
    setProblems((shown) => [
      ...shown,
      ...texts.map((text) => ({ id: crypto.randomUUID(), text })),
    ]);
  }

  async function readDrop(event: DragEvent): Promise<DroppedItem[] | null> {
    event.preventDefault();

    const entries: FileSystemEntry[] = [];
    const withoutEntry: File[] = [];

    for (const item of Array.from(event.dataTransfer.items)) {
      const entry = item.webkitGetAsEntry();

      if (entry) {
        entries.push(entry);
        continue;
      }

      const file = item.getAsFile();

      if (file) {
        withoutEntry.push(file);
      }
    }

    return readDropped(entries).then(
      (read) => [
        ...read,
        ...withoutEntry.map((file) => ({
          rootName: file.name,
          beneath: [],
          file,
        })),
      ],
      () => {
        report([UNREADABLE_DROP]);

        return null;
      },
    );
  }

  async function addDropped(items: DroppedItem[], parentFolderId: string) {
    const { looseFiles, folders } = folderDrops(items);
    const found: string[] = [];
    let created = 0;

    startUploads(looseFiles, parentFolderId);

    for (const folder of folders) {
      let tree;

      try {
        tree = await createFolderTree({
          ...space,
          parentFolderId,
          rootName: folder.rootName,
          paths: folder.paths,
        });
      } catch {
        found.push(`"${folder.rootName}" could not be added. Try again.`);
        continue;
      }

      if (!tree.ok) {
        found.push(tree.refusal);
        continue;
      }

      created += 1;

      for (const { file, folderId } of fileTargets(folder, tree.value)) {
        startUploads([file], folderId);
      }
    }

    report(found);
    onFoldersCreated(created);
  }

  return {
    problems,
    dismissProblem(id: string) {
      setProblems((shown) => shown.filter((problem) => problem.id !== id));
    },
    readDrop,
    addDropped,
    dropInto(event: DragEvent, parentFolderId: string) {
      void readDrop(event).then(
        (items) => items && addDropped(items, parentFolderId),
      );
    },
  };
}
