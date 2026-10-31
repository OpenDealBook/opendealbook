import { proxyActivities, uuid4 } from '@temporalio/workflow';

import type * as activities from '../activities';
import { runFloridaLicenseImport } from './importFloridaLicenses';

const { startFloridaLicenseImport, failFloridaLicenseImport } = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes',
  retry: { maximumAttempts: 3 },
});

const { loadFloridaLicenses } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 hour',
  heartbeatTimeout: '2 minutes',
  retry: { maximumAttempts: 3 },
});

export async function importFloridaLicenses(): Promise<void> {
  await runFloridaLicenseImport({
    newId: uuid4,
    startFloridaLicenseImport,
    loadFloridaLicenses,
    failFloridaLicenseImport,
  });
}
