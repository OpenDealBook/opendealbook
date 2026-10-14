import { isUsableFileName } from './allowed';
import {
  isSkippedDirectory,
  isUnsafeSegment,
  MAX_DIRECTORY_LEVELS,
  MAX_FILES_AND_FOLDERS_AT_ONCE,
} from './paths';

export type FolderTreePlan =
  | { kind: 'planned'; directories: string[]; keyedPaths: Map<string, string> }
  | { kind: 'skipped' }
  | { kind: 'refused'; reason: 'unusable' | 'too-many' | 'too-deep' };

const ROOT_FOLDER = 1;

export function isUsableFolderName(name: string): boolean {
  return isUsableFileName(name) && !name.startsWith('.');
}

export function planFolderTree(
  rootName: string,
  paths: string[],
  parentLevel: number,
): FolderTreePlan {
  const levelsBelowRoot = MAX_DIRECTORY_LEVELS - parentLevel - ROOT_FOLDER;

  if (isSkippedDirectory(rootName)) {
    return { kind: 'skipped' };
  }

  if (!isUsableFolderName(rootName)) {
    return { kind: 'refused', reason: 'unusable' };
  }

  if (levelsBelowRoot < 0) {
    return { kind: 'refused', reason: 'too-deep' };
  }

  const firstSpellings = new Map<string, string>();
  const keyedPaths = new Map<string, string>();

  for (const sent of paths) {
    const segments = sent.split('/').map((segment) => segment.trim());

    if (segments.length > levelsBelowRoot) {
      return { kind: 'refused', reason: 'too-deep' };
    }

    if (segments.some(isUnsafeSegment)) {
      return { kind: 'refused', reason: 'unusable' };
    }

    if (segments.some(isSkippedDirectory)) {
      continue;
    }

    if (!segments.every(isUsableFolderName)) {
      return { kind: 'refused', reason: 'unusable' };
    }

    for (let depth = 1; depth <= segments.length; depth += 1) {
      const directory = segments.slice(0, depth).join('/');

      if (!firstSpellings.has(directory.toLowerCase())) {
        firstSpellings.set(directory.toLowerCase(), directory);
      }
    }

    if (firstSpellings.size + ROOT_FOLDER > MAX_FILES_AND_FOLDERS_AT_ONCE) {
      return { kind: 'refused', reason: 'too-many' };
    }

    keyedPaths.set(sent, segments.join('/'));
  }

  const directories = [...firstSpellings.values()];

  for (const implied of directories) {
    if (!keyedPaths.has(implied)) {
      keyedPaths.set(implied, implied);
    }
  }

  return { kind: 'planned', directories, keyedPaths };
}
