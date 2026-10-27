import { proxyActivities, uuid4 } from '@temporalio/workflow';

import type * as activities from '../activities';
import type { LeadSourceGroup } from './files';
import { importFiles } from './importFiles';

const {
  discoverLeadFiles,
  startLeadImport,
  failLeadImport,
  recordUndatedFile,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes',
  retry: { maximumAttempts: 3 },
});

const { importLeadFile } = proxyActivities<typeof activities>({
  startToCloseTimeout: '6 hours',
  heartbeatTimeout: '2 minutes',
  retry: { maximumAttempts: 3 },
});

const { matchImportedRecords } = proxyActivities<typeof activities>({
  startToCloseTimeout: '6 hours',
  retry: { maximumAttempts: 3 },
});

export async function importLeadSource({
  group,
}: {
  group: LeadSourceGroup;
}): Promise<{ failed: string[] }> {
  return importFiles(await discoverLeadFiles(group), {
    newId: uuid4,
    startLeadImport,
    importLeadFile,
    matchImportedRecords,
    failLeadImport,
    recordUndatedFile,
  });
}
