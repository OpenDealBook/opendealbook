import type { Client } from '@temporalio/client';

import { describe, expect, it, vi } from 'vitest';

import { fakeScheduleClient, staleSchedule } from '../schedules/fakeScheduleClient';
import { ensureLenderReplySyncSchedule } from './schedule';

describe('ensureLenderReplySyncSchedule', () => {
  it('schedules the sync workflow every hour', async () => {
    const create = vi.fn();

    await ensureLenderReplySyncSchedule({ schedule: { create } } as unknown as Client);

    const options = create.mock.calls[0]![0];
    expect(options.scheduleId).toBe('lender-reply-sync');
    expect(options.spec.intervals).toEqual([{ every: '1h' }]);
    expect(options.action.workflowType).toBe('syncLenderRepliesHourly');
  });

  it('applies the current spec to an existing schedule', async () => {
    const { client, schedules } = fakeScheduleClient([
      { ...staleSchedule, scheduleId: 'lender-reply-sync' },
    ]);

    await ensureLenderReplySyncSchedule(client);

    expect(schedules.get('lender-reply-sync')?.spec).toEqual({ intervals: [{ every: '1h' }] });
  });
});
