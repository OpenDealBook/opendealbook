import type { Client } from '@temporalio/client';

import { TASK_QUEUE } from '../ids';
import { ensureSchedule } from './ensureSchedule';

export function ensureFloridaLicenseSchedule(client: Client): Promise<void> {
  return ensureSchedule(client, {
    scheduleId: 'florida-licenses-import',
    spec: { calendars: [{ hour: 7 }] },
    action: {
      type: 'startWorkflow',
      workflowType: 'importFloridaLicenses',
      taskQueue: TASK_QUEUE,
      args: [],
    },
  });
}
