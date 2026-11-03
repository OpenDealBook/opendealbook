import { describe, expect, it } from 'vitest';

import {
  fakeScheduleClient,
  staleSchedule,
} from '../schedules/fakeScheduleClient';
import { ensureScreeningListSchedule } from './schedules';

describe('ensureScreeningListSchedule', () => {
  it('imports the screening list weekly as a hidden platform job', async () => {
    const { client, schedules } = fakeScheduleClient();

    await ensureScreeningListSchedule(client);

    expect(schedules.get('sanctions-import-csl')).toMatchObject({
      spec: { calendars: [{ dayOfWeek: 'MONDAY', hour: 6 }] },
      action: { workflowType: 'importScreeningList', args: [] },
    });
  });

  it('runs the screening list import on the bulk task queue', async () => {
    const { client, schedules } = fakeScheduleClient();

    await ensureScreeningListSchedule(client);

    expect(schedules.get('sanctions-import-csl')?.action.taskQueue).toBe(
      'opendealbook-bulk',
    );
  });

  it('applies the current spec to an existing schedule', async () => {
    const { client, schedules } = fakeScheduleClient([
      { ...staleSchedule, scheduleId: 'sanctions-import-csl' },
    ]);

    await ensureScreeningListSchedule(client);

    expect(schedules.get('sanctions-import-csl')?.spec).toEqual({
      calendars: [{ dayOfWeek: 'MONDAY', hour: 6 }],
    });
  });
});
