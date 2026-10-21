import { describe, expect, it } from 'vitest';

import { fakeScheduleClient, staleSchedule } from './fakeScheduleClient';
import { ensureSbaRefreshSchedule } from './sbaRefresh';

describe('ensureSbaRefreshSchedule', () => {
  it('applies the current spec to an existing schedule', async () => {
    const { client, schedules } = fakeScheduleClient([
      { ...staleSchedule, scheduleId: 'sba-loans-refresh' },
    ]);

    await ensureSbaRefreshSchedule(client);

    expect(schedules.get('sba-loans-refresh')?.spec).toEqual({
      calendars: [{ month: ['FEBRUARY', 'MAY', 'AUGUST', 'NOVEMBER'], dayOfMonth: 1, hour: 6 }],
    });
  });
});
