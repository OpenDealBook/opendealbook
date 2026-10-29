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
  skipLeadImport: (skip: {
    importId: string;
    file: LeadFile;
    reason: string;
  }) => Promise<void>;
}

const fileKey = (file: LeadFileRef) =>
  file.kind === 'state_registry' ? file.dataset : file.url;

export async function importFiles(
  files: DiscoveredFile[],
  steps: ImportSteps,
): Promise<{ failed: string[] }> {
  const failed: string[] = [];
  const notLoaded = new Set<string>();

  for (const file of files) {
    const importId = steps.newId();
    if ('failure' in file) {
      await steps.recordUndatedFile({ importId, file, reason: file.failure });
      failed.push(file.url);
      notLoaded.add(fileKey(file));
      continue;
    }
    if (
      file.kind === 'state_registry' &&
      file.parent !== undefined &&
      notLoaded.has(file.parent)
    ) {
      await steps.skipLeadImport({
        importId,
        file,
        reason: `${file.parent} did not load in this run`,
      });
      notLoaded.add(fileKey(file));
      continue;
    }
    const { skipped } = await steps.startLeadImport({ importId, file });
    if (skipped) {
      notLoaded.add(fileKey(file));
      continue;
    }
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
      notLoaded.add(fileKey(file));
    }
  }

  return { failed };
}
