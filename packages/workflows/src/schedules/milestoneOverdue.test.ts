import type { Client, ScheduleOptions } from '@temporalio/client';

import { describe, expect, it } from 'vitest';

import { fakeScheduleClient, staleSchedule } from './fakeScheduleClient';
import { ensureMilestoneOverdueSchedule } from './milestoneOverdue';

describe('ensureMilestoneOverdueSchedule', () => {
  it('runs the overdue notice workflow every day at 13:00 UTC', async () => {
    const created: ScheduleOptions[] = [];
    const client = {
      schedule: {
        create: async (options: ScheduleOptions) => {
          created.push(options);
        },
      },
    } as unknown as Client;

    await ensureMilestoneOverdueSchedule(client);

    expect(created).toMatchObject([
      {
        spec: { calendars: [{ hour: 13 }] },
        action: {
          type: 'startWorkflow',
          workflowType: 'notifyOverdueMilestonesDaily',
          taskQueue: 'opendealbook',
        },
      },
    ]);
  });

  it('applies the current spec to an existing schedule', async () => {
    const { client, schedules } = fakeScheduleClient([
      { ...staleSchedule, scheduleId: 'milestone-overdue-notice' },
    ]);

    await ensureMilestoneOverdueSchedule(client);

    expect(schedules.get('milestone-overdue-notice')?.spec).toEqual({ calendars: [{ hour: 13 }] });
  });
});
