import type { Client } from '@temporalio/client';
import type { WorkerOptions } from '@temporalio/worker';

import {
  ensureApprovalReminderSchedule,
  ensureCompEventRelay,
  ensureContractReviewReminderEmailSchedule,
  ensureContractReviewTodoSyncSchedule,
  ensureDealEventNotificationRelay,
  ensureDocumentIngestionBackfillSchedule,
  ensureDocumentIngestionRelay,
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
  ensureRemovedDocumentTextPurgeSchedule,
  ensureSbaRefreshSchedule,
  ensureScreeningListLoaded,
  ensureScreeningListSchedule,
  ensureUploadCleanupSchedule,
  ensureWorkflowEventRelay,
  ensureWorkflowPruneSchedule,
} from '@odb/workflows';
import { BULK_TASK_QUEUE, TASK_QUEUE } from '@odb/workflows/client';

import type { env } from './env.ts';

interface Lane {
  options: Pick<
    WorkerOptions,
    'taskQueue' | 'maxConcurrentActivityTaskExecutions'
  >;
  ensures: ((client: Client) => Promise<unknown>)[];
}

const mainLane: Lane = {
  options: { taskQueue: TASK_QUEUE },
  ensures: [
    ensureCompEventRelay,
    ensureDealEventNotificationRelay,
    ensureDocumentIngestionRelay,
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
    ensureRemovedDocumentTextPurgeSchedule,
    ensureDocumentIngestionBackfillSchedule,
    ensureApprovalReminderSchedule,
    ensureLeadImportSchedules,
    ensureScreeningListSchedule,
    ensureScreeningListLoaded,
    ensureFloridaLicenseSchedule,
    ensureSbaRefreshSchedule,
  ],
};

const bulkLane: Lane = {
  options: {
    taskQueue: BULK_TASK_QUEUE,
    maxConcurrentActivityTaskExecutions: 2,
  },
  ensures: [],
};

export const lanesByWorkerQueue: Record<(typeof env)['WORKER_QUEUE'], Lane[]> =
  {
    main: [mainLane],
    bulk: [bulkLane],
    all: [mainLane, bulkLane],
  };
