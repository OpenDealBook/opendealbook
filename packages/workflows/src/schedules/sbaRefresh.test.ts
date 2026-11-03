import { describe, expect, it } from 'vitest';

import { fakeScheduleClient, staleSchedule } from './fakeScheduleClient';
import { ensureSbaRefreshSchedule } from './sbaRefresh';

describe('ensureSbaRefreshSchedule', () => {
  it('runs the SBA refresh on the bulk task queue', async () => {
    const { client, schedules } = fakeScheduleClient();

    await ensureSbaRefreshSchedule(client);

    expect(schedules.get('sba-loans-refresh')?.action.taskQueue).toBe(
      'opendealbook-bulk',
    );
  });

  it('applies the current spec to an existing schedule', async () => {
    const { client, schedules } = fakeScheduleClient([
      { ...staleSchedule, scheduleId: 'sba-loans-refresh' },
    ]);

    await ensureSbaRefreshSchedule(client);

    expect(schedules.get('sba-loans-refresh')?.spec).toEqual({
      calendars: [
        {
          month: ['FEBRUARY', 'MAY', 'AUGUST', 'NOVEMBER'],
          dayOfMonth: 1,
          hour: 6,
        },
      ],
    });
  });
});
