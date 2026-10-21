import type { RoomFolder } from '../contents/listing';
import { filesUnder } from './room-places';

export function selectionRange(
  orderedIds: string[],
  anchorId: string,
  targetId: string,
): string[] {
  const anchor = orderedIds.indexOf(anchorId);
  const target = orderedIds.indexOf(targetId);

  return orderedIds.slice(
    Math.min(anchor, target),
    Math.max(anchor, target) + 1,
  );
}

export function zipSelection(
  fileIds: string[],
  folders: RoomFolder[],
): string[] {
  return [
    ...new Set([
      ...fileIds,
      ...folders.flatMap(filesUnder).map((file) => file.documentId),
    ]),
  ];
}

function counted(count: number, noun: string): string[] {
  return count === 0 ? [] : [`${count} ${noun}${count === 1 ? '' : 's'}`];
}

export function selectionSummary(selected: {
  files: number;
  folders: number;
}): string {
  return `${[
    ...counted(selected.files, 'file'),
    ...counted(selected.folders, 'folder'),
  ].join(', ')} selected`;
}
