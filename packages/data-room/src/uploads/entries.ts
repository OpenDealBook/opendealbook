export interface ZipEntry {
  originalPath: string;
  contentType: string | null;
  bytes: Uint8Array;
}

export function zipEntriesFromMap(
  files: Record<string, Uint8Array>,
): ZipEntry[] {
  return Object.entries(files)
    .filter(([path]) => !path.endsWith('/'))
    .map(([path, bytes]) => ({ originalPath: path, contentType: null, bytes }));
}
