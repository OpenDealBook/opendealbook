import type { Client } from '@temporalio/client';

import { describe, expect, it, vi } from 'vitest';

import { fakeScheduleClient, staleSchedule } from '../schedules/fakeScheduleClient';
import {
  ensureContractReviewReminderEmailSchedule,
  ensureContractReviewTodoSyncSchedule,
} from './schedule';

describe('ensureContractReviewTodoSyncSchedule', () => {
  it('schedules the waiting-on-counsel to-do sync every hour', async () => {
    const create = vi.fn();

    await ensureContractReviewTodoSyncSchedule({ schedule: { create } } as unknown as Client);

    const options = create.mock.calls[0]![0];
    expect(options.scheduleId).toBe('contract-review-todo-sync');
    expect(options.spec.intervals).toEqual([{ every: '1h' }]);
    expect(options.action.workflowType).toBe('syncContractReviewTodosHourly');
  });

  it('applies the current spec to an existing schedule', async () => {
    const { client, schedules } = fakeScheduleClient([
      { ...staleSchedule, scheduleId: 'contract-review-todo-sync' },
    ]);

    await ensureContractReviewTodoSyncSchedule(client);

    expect(schedules.get('contract-review-todo-sync')?.spec).toEqual({ intervals: [{ every: '1h' }] });
  });
});

describe('ensureContractReviewReminderEmailSchedule', () => {
  it('checks every hour on the hour for reviewers whose local time is 8am', async () => {
    const create = vi.fn();

    await ensureContractReviewReminderEmailSchedule({ schedule: { create } } as unknown as Client);

    const options = create.mock.calls[0]![0];
    expect(options.scheduleId).toBe('contract-review-daily-reminder');
    expect(options.spec.intervals).toEqual([{ every: '1h' }]);
    expect(options.action.workflowType).toBe('emailContractReviewRemindersHourly');
  });

  it('applies the current spec to an existing schedule', async () => {
    const { client, schedules } = fakeScheduleClient([
      { ...staleSchedule, scheduleId: 'contract-review-daily-reminder' },
    ]);

    await ensureContractReviewReminderEmailSchedule(client);

    expect(schedules.get('contract-review-daily-reminder')?.spec).toEqual({ intervals: [{ every: '1h' }] });
  });
});
