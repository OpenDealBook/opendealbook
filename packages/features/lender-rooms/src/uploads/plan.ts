import { unzipSync } from 'fflate';

import { isUsableFileName, isVideoOrAudio, MAX_UPLOAD_BYTES } from './allowed';
import {
  isSkippedDirectory,
  isUnsafeSegment,
  MAX_DIRECTORY_LEVELS,
  MAX_FILES_AND_FOLDERS_AT_ONCE,
} from './paths';

export interface ExpansionPlan {
  folders: [string, ...string[]];
  documents: { folder: string; name: string; bytes: Uint8Array }[];
  oversize: { folder: string; name: string; sizeBytes: number }[];
}

interface ArchiveUsage {
  parentLevel: number;
  filesAndFolders: number;
  inflatedBytes: number;
}

interface Inflated {
  files: Record<string, Uint8Array>;
  tooLarge: { place: EntryPlace; sizeBytes: number }[];
}

interface EntryPlace {
  directories: string[];
  name: string;
}

const MAX_ARCHIVE_INFLATED_BYTES = 1024 ** 3;
const MAX_ARCHIVE_DEPTH = 3;

const ZIP_EXTENSION = /\.zip$/i;
const MACOS_RESOURCE_PREFIX = '._';

const END_OF_DIRECTORY_SIGNATURE = 0x06054b50;
const END_OF_DIRECTORY_MIN_LENGTH = 22;
const END_OF_DIRECTORY_ENTRY_COUNT_OFFSET = 10;
const END_OF_DIRECTORY_START_OFFSET = 16;
const ZIP64_ENTRY_COUNT = 0xffff;
const ZIP64_START = 0xffffffff;
const DIRECTORY_ENTRY_SIGNATURE = 0x02014b50;
const DIRECTORY_ENTRY_FIXED_LENGTH = 46;
const DIRECTORY_ENTRY_FLAGS_OFFSET = 8;
const DIRECTORY_ENTRY_NAME_LENGTH_OFFSET = 28;
const DIRECTORY_ENTRY_EXTRA_LENGTH_OFFSET = 30;
const DIRECTORY_ENTRY_COMMENT_LENGTH_OFFSET = 32;
const ENCRYPTED_FLAG = 1;

class ArchiveNotExpandable extends Error {}

export function isZip(name: string): boolean {
  return ZIP_EXTENSION.test(name);
}

export function planExpansion(
  archiveName: string,
  archive: Uint8Array,
  parentLevel: number,
): ExpansionPlan | null {
  const root = folderNameFor(archiveName);
  const plan: ExpansionPlan = { folders: [root], documents: [], oversize: [] };
  const usage: ArchiveUsage = {
    parentLevel,
    filesAndFolders: 1,
    inflatedBytes: 0,
  };

  try {
    return expandInto(plan, usage, root, archive, 1) ? plan : null;
  } catch (error) {
    if (error instanceof ArchiveNotExpandable) {
      return null;
    }

    throw error;
  }
}

function folderNameFor(archiveName: string): string {
  return archiveName.replace(ZIP_EXTENSION, '');
}

function expandInto(
  plan: ExpansionPlan,
  usage: ArchiveUsage,
  root: string,
  archive: Uint8Array,
  depth: number,
): boolean {
  if (depth > MAX_ARCHIVE_DEPTH) {
    throw new ArchiveNotExpandable();
  }

  const inflated = inflate(archive, usage);

  if (!inflated) {
    return false;
  }

  addFolderWithAncestors(plan, usage, root);

  for (const { place, sizeBytes } of inflated.tooLarge) {
    const folder = [root, ...place.directories].join('/');

    addFolderWithAncestors(plan, usage, folder);
    plan.oversize.push({ folder, name: place.name, sizeBytes });
  }

  for (const [path, bytes] of Object.entries(inflated.files)) {
    const place = entryPlace(path);

    if (!place) {
      continue;
    }

    const { name } = place;
    const folder = [root, ...place.directories].join('/');

    addFolderWithAncestors(plan, usage, folder);

    if (
      isZip(name) &&
      expandInto(
        plan,
        usage,
        `${folder}/${folderNameFor(name)}`,
        bytes,
        depth + 1,
      )
    ) {
      continue;
    }

    if (bytes.length > MAX_UPLOAD_BYTES) {
      plan.oversize.push({ folder, name, sizeBytes: bytes.length });
    } else {
      plan.documents.push({ folder, name, bytes });
    }
  }

  return true;
}

function entryPlace(path: string): EntryPlace | null {
  const segments = path.split('/');

  if (segments.length - 1 > MAX_DIRECTORY_LEVELS) {
    throw new ArchiveNotExpandable();
  }

  const name = (segments.pop() ?? '').trim();
  const directories = segments.filter((segment) => !isUnsafeSegment(segment));

  if (
    isUnsafeSegment(name) ||
    !isUsableFileName(name) ||
    isVideoOrAudio(name) ||
    name.startsWith(MACOS_RESOURCE_PREFIX) ||
    directories.some(isSkippedDirectory)
  ) {
    return null;
  }

  if (!directories.every(isUsableFileName)) {
    throw new ArchiveNotExpandable();
  }

  return { directories, name };
}

function inflate(archive: Uint8Array, usage: ArchiveUsage): Inflated | null {
  if (isEncryptedOrZip64(archive)) {
    return null;
  }

  const tooLarge: Inflated['tooLarge'] = [];

  try {
    const files = unzipSync(archive, {
      filter: (file) => {
        const place = entryPlace(file.name);

        if (!place) {
          return false;
        }

        countFileOrFolder(usage);

        if (file.originalSize > MAX_UPLOAD_BYTES && !isZip(place.name)) {
          tooLarge.push({ place, sizeBytes: file.originalSize });

          return false;
        }

        usage.inflatedBytes += file.originalSize;

        if (usage.inflatedBytes > MAX_ARCHIVE_INFLATED_BYTES) {
          throw new ArchiveNotExpandable();
        }

        return true;
      },
    });

    return { files, tooLarge };
  } catch (error) {
    if (isUnzipLibraryError(error)) {
      return null;
    }

    throw error;
  }
}

function countFileOrFolder(usage: ArchiveUsage) {
  usage.filesAndFolders += 1;

  if (usage.filesAndFolders > MAX_FILES_AND_FOLDERS_AT_ONCE) {
    throw new ArchiveNotExpandable();
  }
}

function isUnzipLibraryError(error: unknown): boolean {
  return (
    error instanceof Error && 'code' in error && typeof error.code === 'number'
  );
}

function addFolderWithAncestors(
  plan: ExpansionPlan,
  usage: ArchiveUsage,
  path: string,
) {
  const segments = path.split('/');

  if (usage.parentLevel + segments.length > MAX_DIRECTORY_LEVELS) {
    throw new ArchiveNotExpandable();
  }

  for (let depth = 1; depth <= segments.length; depth += 1) {
    const ancestor = segments.slice(0, depth).join('/');

    if (!plan.folders.includes(ancestor)) {
      plan.folders.push(ancestor);
      countFileOrFolder(usage);
    }
  }
}

function isEncryptedOrZip64(archive: Uint8Array): boolean {
  const view = new DataView(
    archive.buffer,
    archive.byteOffset,
    archive.byteLength,
  );
  let end = archive.byteLength - END_OF_DIRECTORY_MIN_LENGTH;

  while (end >= 0 && view.getUint32(end, true) !== END_OF_DIRECTORY_SIGNATURE) {
    end -= 1;
  }

  if (end < 0) {
    return false;
  }

  let entry = view.getUint32(end + END_OF_DIRECTORY_START_OFFSET, true);

  if (
    entry === ZIP64_START ||
    view.getUint16(end + END_OF_DIRECTORY_ENTRY_COUNT_OFFSET, true) ===
      ZIP64_ENTRY_COUNT
  ) {
    return true;
  }

  while (
    entry + DIRECTORY_ENTRY_FIXED_LENGTH <= archive.byteLength &&
    view.getUint32(entry, true) === DIRECTORY_ENTRY_SIGNATURE
  ) {
    if (
      view.getUint16(entry + DIRECTORY_ENTRY_FLAGS_OFFSET, true) &
      ENCRYPTED_FLAG
    ) {
      return true;
    }

    entry +=
      DIRECTORY_ENTRY_FIXED_LENGTH +
      view.getUint16(entry + DIRECTORY_ENTRY_NAME_LENGTH_OFFSET, true) +
      view.getUint16(entry + DIRECTORY_ENTRY_EXTRA_LENGTH_OFFSET, true) +
      view.getUint16(entry + DIRECTORY_ENTRY_COMMENT_LENGTH_OFFSET, true);
  }

  return false;
}
