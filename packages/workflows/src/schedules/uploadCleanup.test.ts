import type { Client } from '@temporalio/client';

import { describe, expect, it } from 'vitest';

import { fakeScheduleClient, staleSchedule } from './fakeScheduleClient';
import { ensureUploadCleanupSchedule } from './uploadCleanup';

describe('ensureUploadCleanupSchedule', () => {
  it('applies the current spec to an existing schedule', async () => {
    const { client, schedules } = fakeScheduleClient([
      { ...staleSchedule, scheduleId: 'unfinished-upload-cleanup' },
    ]);

    await ensureUploadCleanupSchedule(client);

    expect(schedules.get('unfinished-upload-cleanup')?.spec).toEqual({ calendars: [{ hour: 4 }] });
  });
});
