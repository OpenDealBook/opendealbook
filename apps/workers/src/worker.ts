import { NativeConnection, Worker } from '@temporalio/worker';

import {
  ensureApprovalReminderSchedule,
  ensureCompEventRelay,
  ensureContractReviewReminderEmailSchedule,
  ensureContractReviewTodoSyncSchedule,
  ensureDealEventNotificationRelay,
  ensureFloridaLicenseSchedule,
  ensureLeadImportSchedules,
  ensureLenderNudgeEmailSchedule,
  ensureLenderNudgeTodoSyncSchedule,
  ensureLenderOutreachStaleSweepSchedule,
  ensureLenderReplySyncSchedule,
  ensureMilestoneOverdueSchedule,
  ensureOrphanDealFileSweepSchedule,
  ensureOutreachDispatchSchedule,
  ensureOutreachReplySyncSchedule,
  ensureOutreachStaleSweepSchedule,
  ensureScreeningListLoaded,
  ensureScreeningListSchedule,
  ensureUploadCleanupSchedule,
  ensureWorkflowEventRelay,
  ensureWorkflowPruneSchedule,
} from '@odb/workflows';
import * as activities from '@odb/workflows/activities';
import { getTemporalClient, TASK_QUEUE } from '@odb/workflows/client';

import { env } from './env.ts';

import { fileURLToPath } from 'node:url';

const workflowsPath = fileURLToPath(
  new URL('./workflows/index.ts', import.meta.resolve('@odb/workflows')),
);

const connection = await NativeConnection.connect({
  address: env.TEMPORAL_ADDRESS,
});

const worker = await Worker.create({
  connection,
  namespace: 'default',
  taskQueue: TASK_QUEUE,
  workflowsPath,
  activities,
});

const client = await getTemporalClient();

for (const ensure of [
  ensureCompEventRelay,
  ensureDealEventNotificationRelay,
  ensureWorkflowEventRelay,
  ensureUploadCleanupSchedule,
  ensureOrphanDealFileSweepSchedule,
  ensureMilestoneOverdueSchedule,
  ensureLenderReplySyncSchedule,
  ensureLenderOutreachStaleSweepSchedule,
  ensureLenderNudgeTodoSyncSchedule,
  ensureLenderNudgeEmailSchedule,
  ensureContractReviewTodoSyncSchedule,
  ensureContractReviewReminderEmailSchedule,
  ensureOutreachDispatchSchedule,
  ensureOutreachStaleSweepSchedule,
  ensureOutreachReplySyncSchedule,
  ensureWorkflowPruneSchedule,
  ensureApprovalReminderSchedule,
  ensureLeadImportSchedules,
  ensureScreeningListSchedule,
  ensureScreeningListLoaded,
  ensureFloridaLicenseSchedule,
]) {
  try {
    await ensure(client);
  } catch (error) {
    console.error(`relay ensure failed: ${ensure.name}`, error);
  }
}

await worker.run();
