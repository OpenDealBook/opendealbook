import type { Client } from '@temporalio/client';

import { TASK_QUEUE } from '../ids';
import { ensureSchedule } from '../schedules/ensureSchedule';
import { currentSnapshot } from './screenSubjects';
import { isLoaded } from './snapshot';

const SCREENING_LIST_SCHEDULE_ID = 'sanctions-import-csl';

export async function ensureScreeningListSchedule(client: Client): Promise<void> {
  await ensureSchedule(client, {
    scheduleId: SCREENING_LIST_SCHEDULE_ID,
    spec: { calendars: [{ dayOfWeek: 'MONDAY', hour: 6 }] },
    action: {
      type: 'startWorkflow',
      workflowType: 'importScreeningList',
      taskQueue: TASK_QUEUE,
      args: [],
    },
  });
}

export async function ensureScreeningListLoaded(client: Client): Promise<void> {
  if (!isLoaded(await currentSnapshot())) {
    await client.schedule.getHandle(SCREENING_LIST_SCHEDULE_ID).trigger();
  }
}
