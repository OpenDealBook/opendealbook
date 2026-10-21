import { describe, expect, it } from 'vitest';

import { fakeScheduleClient } from './fakeScheduleClient';
import { ensureOrphanDealFileSweepSchedule } from './orphanDealFileSweep';

describe('ensureOrphanDealFileSweepSchedule', () => {
  it('runs the orphaned deal object sweep every day at 05:00 UTC', async () => {
    const { client, schedules } = fakeScheduleClient();

    await ensureOrphanDealFileSweepSchedule(client);

    expect([...schedules.values()]).toMatchObject([
      {
        spec: { calendars: [{ hour: 5 }] },
        action: {
          type: 'startWorkflow',
          workflowType: 'sweepOrphanedDealObjects',
          taskQueue: 'opendealbook',
        },
      },
    ]);
  });
});
