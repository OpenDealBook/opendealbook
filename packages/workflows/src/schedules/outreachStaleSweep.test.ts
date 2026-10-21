import type { Client } from '@temporalio/client';

import { describe, expect, it, vi } from 'vitest';

import { fakeScheduleClient, staleSchedule } from './fakeScheduleClient';
import { ensureOutreachStaleSweepSchedule } from './outreachStaleSweep';

describe('ensureOutreachStaleSweepSchedule', () => {
  it('schedules the outreach sweep workflow every 15 minutes', async () => {
    const create = vi.fn();

    await ensureOutreachStaleSweepSchedule({ schedule: { create } } as unknown as Client);

    const options = create.mock.calls[0]![0];
    expect(options.scheduleId).toBe('outreach-stale-sweep');
    expect(options.spec.intervals).toEqual([{ every: '15m' }]);
    expect(options.action.workflowType).toBe('sweepStaleOutreachMessages');
  });

  it('applies the current spec to an existing schedule', async () => {
    const { client, schedules } = fakeScheduleClient([
      { ...staleSchedule, scheduleId: 'outreach-stale-sweep' },
    ]);

    await ensureOutreachStaleSweepSchedule(client);

    expect(schedules.get('outreach-stale-sweep')?.spec).toEqual({ intervals: [{ every: '15m' }] });
  });
});
