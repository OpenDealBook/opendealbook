import type { Client } from '@temporalio/client';

import { describe, expect, it, vi } from 'vitest';

import { fakeScheduleClient, staleSchedule } from '../schedules/fakeScheduleClient';
import {
  ensureLenderNudgeEmailSchedule,
  ensureLenderNudgeTodoSyncSchedule,
} from './schedule';

describe('ensureLenderNudgeTodoSyncSchedule', () => {
  it('schedules the nudge to-do sync every hour', async () => {
    const create = vi.fn();

    await ensureLenderNudgeTodoSyncSchedule({ schedule: { create } } as unknown as Client);

    const options = create.mock.calls[0]![0];
    expect(options.scheduleId).toBe('lender-nudge-todo-sync');
    expect(options.spec.intervals).toEqual([{ every: '1h' }]);
    expect(options.action.workflowType).toBe('syncLenderNudgeTodosHourly');
  });

  it('applies the current spec to an existing schedule', async () => {
    const { client, schedules } = fakeScheduleClient([
      { ...staleSchedule, scheduleId: 'lender-nudge-todo-sync' },
    ]);

    await ensureLenderNudgeTodoSyncSchedule(client);

    expect(schedules.get('lender-nudge-todo-sync')?.spec).toEqual({ intervals: [{ every: '1h' }] });
  });
});

describe('ensureLenderNudgeEmailSchedule', () => {
  it('checks every hour on the hour for deal managers whose local time is 8am', async () => {
    const create = vi.fn();

    await ensureLenderNudgeEmailSchedule({ schedule: { create } } as unknown as Client);

    const options = create.mock.calls[0]![0];
    expect(options.scheduleId).toBe('lender-nudge-daily-email');
    expect(options.spec.intervals).toEqual([{ every: '1h' }]);
    expect(options.action.workflowType).toBe('emailLendersToNudgeHourly');
  });

  it('applies the current spec to an existing schedule', async () => {
    const { client, schedules } = fakeScheduleClient([
      { ...staleSchedule, scheduleId: 'lender-nudge-daily-email' },
    ]);

    await ensureLenderNudgeEmailSchedule(client);

    expect(schedules.get('lender-nudge-daily-email')?.spec).toEqual({ intervals: [{ every: '1h' }] });
  });
});
