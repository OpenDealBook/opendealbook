import type { Client } from '@temporalio/client';

import { TASK_QUEUE } from '../ids';
import { ensureSchedule } from './ensureSchedule';

export function ensureRemovedDocumentTextPurgeSchedule(
  client: Client,
): Promise<void> {
  return ensureSchedule(client, {
    scheduleId: 'removed-document-text-purge',
    spec: { calendars: [{ hour: 2 }] },
    action: {
      type: 'startWorkflow',
      workflowType: 'purgeRemovedDocumentTextNightly',
      taskQueue: TASK_QUEUE,
      args: [],
    },
  });
}
