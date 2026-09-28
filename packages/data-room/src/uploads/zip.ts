import { unzipSync } from 'fflate';

import { type ZipEntry, zipEntriesFromMap } from './entries';

export function extractZipEntries(archive: Uint8Array): ZipEntry[] {
  return zipEntriesFromMap(unzipSync(archive));
}
