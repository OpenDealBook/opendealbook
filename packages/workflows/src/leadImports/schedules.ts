import type { Client, ScheduleSpec } from '@temporalio/client';

import { TASK_QUEUE } from '../ids';
import { ensureSchedule } from '../schedules/ensureSchedule';
import type { LeadSourceGroup } from './files';

const LEAD_IMPORT_SCHEDULES: {
  scheduleId: string;
  group: LeadSourceGroup;
  spec: ScheduleSpec;
}[] = [
  {
    scheduleId: 'lead-import-ppp',
    group: 'ppp',
    spec: {
      calendars: [
        {
          month: ['JANUARY', 'APRIL', 'JULY', 'OCTOBER'],
          dayOfMonth: 3,
          hour: 6,
        },
      ],
    },
  },
  {
    scheduleId: 'lead-import-sba',
    group: 'sba',
    spec: {
      calendars: [
        {
          month: ['FEBRUARY', 'MAY', 'AUGUST', 'NOVEMBER'],
          dayOfMonth: 2,
          hour: 6,
        },
      ],
    },
  },
  {
    scheduleId: 'lead-import-form-5500',
    group: 'form_5500',
    spec: { calendars: [{ dayOfMonth: 5, hour: 6 }] },
  },
  {
    scheduleId: 'lead-import-state-registry',
    group: 'state_registry',
    spec: { calendars: [{ dayOfWeek: 'SUNDAY', hour: 6 }] },
  },
];

export async function ensureLeadImportSchedules(client: Client): Promise<void> {
  for (const { scheduleId, group, spec } of LEAD_IMPORT_SCHEDULES) {
    await ensureSchedule(client, {
      scheduleId,
      spec,
      action: {
        type: 'startWorkflow',
        workflowType: 'importLeadSource',
        taskQueue: TASK_QUEUE,
        args: [{ group }],
      },
    });
  }
}
