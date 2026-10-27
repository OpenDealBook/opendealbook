import { describe, expect, it } from 'vitest';

import {
  fakeScheduleClient,
  staleSchedule,
} from '../schedules/fakeScheduleClient';
import { ensureLeadImportSchedules } from './schedules';

describe('ensureLeadImportSchedules', () => {
  it('schedules one hidden import per lead source', async () => {
    const { client, schedules } = fakeScheduleClient();

    await ensureLeadImportSchedules(client);

    expect(
      [...schedules.values()].map((schedule) => [
        schedule.scheduleId,
        schedule.action,
      ]),
    ).toEqual([
      [
        'lead-import-ppp',
        expect.objectContaining({
          workflowType: 'importLeadSource',
          args: [{ group: 'ppp' }],
        }),
      ],
      [
        'lead-import-sba',
        expect.objectContaining({
          workflowType: 'importLeadSource',
          args: [{ group: 'sba' }],
        }),
      ],
      [
        'lead-import-form-5500',
        expect.objectContaining({
          workflowType: 'importLeadSource',
          args: [{ group: 'form_5500' }],
        }),
      ],
      [
        'lead-import-state-registry',
        expect.objectContaining({
          workflowType: 'importLeadSource',
          args: [{ group: 'state_registry' }],
        }),
      ],
    ]);
  });

  it('applies the current spec to an existing schedule', async () => {
    const { client, schedules } = fakeScheduleClient([
      { ...staleSchedule, scheduleId: 'lead-import-sba' },
    ]);

    await ensureLeadImportSchedules(client);

    expect(schedules.get('lead-import-sba')?.spec).toEqual({
      calendars: [
        {
          month: ['FEBRUARY', 'MAY', 'AUGUST', 'NOVEMBER'],
          dayOfMonth: 2,
          hour: 6,
        },
      ],
    });
  });
});
