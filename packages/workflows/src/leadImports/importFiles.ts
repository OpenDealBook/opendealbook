import type { Enums } from '@odb/supabase';

import {
  type DiscoveredFile,
  LEAD_SOURCE,
  type LeadFile,
  type LeadFileRef,
} from './files';

interface ImportSteps {
  newId: () => string;
  startLeadImport: (start: {
    importId: string;
    file: LeadFile;
  }) => Promise<{ skipped: boolean }>;
  importLeadFile: (load: { importId: string; file: LeadFile }) => Promise<void>;
  matchImportedRecords: (match: {
    source: Enums<'lead_source'>;
    importId: string;
  }) => Promise<void>;
  failLeadImport: (failure: {
    importId: string;
    reason: string;
  }) => Promise<void>;
  recordUndatedFile: (failure: {
    importId: string;
    file: LeadFileRef;
    reason: string;
  }) => Promise<void>;
}

export async function importFiles(
  files: DiscoveredFile[],
  steps: ImportSteps,
): Promise<{ failed: string[] }> {
  const failed: string[] = [];

  for (const file of files) {
    const importId = steps.newId();
    if ('failure' in file) {
      await steps.recordUndatedFile({ importId, file, reason: file.failure });
      failed.push(file.url);
      continue;
    }
    const { skipped } = await steps.startLeadImport({ importId, file });
    if (skipped) continue;
    try {
      await steps.importLeadFile({ importId, file });
      await steps.matchImportedRecords({
        source: LEAD_SOURCE[file.kind],
        importId,
      });
    } catch (error) {
      const failure = error as Error;
      await steps.failLeadImport({
        importId,
        reason:
          (failure.cause as Error | undefined)?.message ?? failure.message,
      });
      failed.push(file.url);
    }
  }

  return { failed };
}
