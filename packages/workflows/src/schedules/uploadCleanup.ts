import type { Client } from '@temporalio/client';

import { TASK_QUEUE } from '../ids';
import { ensureSchedule } from './ensureSchedule';

const UPLOAD_CLEANUP_SCHEDULE_ID = 'unfinished-upload-cleanup';

export function ensureUploadCleanupSchedule(
  client: Client,
): Promise<void> {
  return ensureSchedule(client, {
    scheduleId: UPLOAD_CLEANUP_SCHEDULE_ID,
    spec: { calendars: [{ hour: 4 }] },
    action: {
      type: 'startWorkflow',
      workflowType: 'cleanUpUnfinishedUploads',
      taskQueue: TASK_QUEUE,
      args: [],
    },
  });
}
