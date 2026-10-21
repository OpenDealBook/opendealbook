import type { Client } from '@temporalio/client';

import { describe, expect, it, vi } from 'vitest';

import { fakeScheduleClient, staleSchedule } from '../schedules/fakeScheduleClient';
import { ensureLenderOutreachStaleSweepSchedule } from './staleSweepSchedule';

describe('ensureLenderOutreachStaleSweepSchedule', () => {
  it('schedules the sweep workflow every 15 minutes', async () => {
    const create = vi.fn();

    await ensureLenderOutreachStaleSweepSchedule({
      schedule: { create },
    } as unknown as Client);

    const options = create.mock.calls[0]![0];
    expect(options.scheduleId).toBe('lender-outreach-stale-sweep');
    expect(options.spec.intervals).toEqual([{ every: '15m' }]);
    expect(options.action.workflowType).toBe('sweepStaleLenderOutreach');
  });

  it('applies the current spec to an existing schedule', async () => {
    const { client, schedules } = fakeScheduleClient([
      { ...staleSchedule, scheduleId: 'lender-outreach-stale-sweep' },
    ]);

    await ensureLenderOutreachStaleSweepSchedule(client);

    expect(schedules.get('lender-outreach-stale-sweep')?.spec).toEqual({ intervals: [{ every: '15m' }] });
  });
});
