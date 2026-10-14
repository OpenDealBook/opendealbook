export const MAX_FILES_AND_FOLDERS_AT_ONCE = 2000;
export const MAX_DIRECTORY_LEVELS = 20;
export const MAX_FOLDERS_IN_SPACE = 5000;

const UNSAFE_SEGMENT = /^(|\.|\.\.|[a-z]:)$/i;
const MACOS_RESOURCE_DIRECTORY = '__MACOSX';

export function isUnsafeSegment(segment: string): boolean {
  return UNSAFE_SEGMENT.test(segment);
}

export function isSkippedDirectory(name: string): boolean {
  return name.startsWith('.') || name === MACOS_RESOURCE_DIRECTORY;
}
