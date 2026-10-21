import type { ScheduleOptions } from '@temporalio/client';

import { describe, expect, it } from 'vitest';

import { ensureSchedule } from './ensureSchedule';
import { fakeScheduleClient } from './fakeScheduleClient';

const hourly: ScheduleOptions = {
  scheduleId: 'sync',
  spec: { intervals: [{ every: '1h' }] },
  action: { type: 'startWorkflow', workflowType: 'syncV2', taskQueue: 'q', args: [] },
};

const daily: ScheduleOptions = {
  scheduleId: 'sync',
  spec: { calendars: [{ hour: 4 }] },
  action: { type: 'startWorkflow', workflowType: 'syncV1', taskQueue: 'q', args: [] },
};

describe('ensureSchedule', () => {
  it('creates the schedule when none exists', async () => {
    const { client, schedules } = fakeScheduleClient();

    await ensureSchedule(client, hourly);

    expect(schedules.get('sync')).toEqual(hourly);
  });

  it('applies the current spec and action to an existing schedule', async () => {
    const { client, schedules } = fakeScheduleClient([daily]);

    await ensureSchedule(client, hourly);

    expect(schedules.get('sync')).toMatchObject({
      spec: hourly.spec,
      action: hourly.action,
    });
  });

  it('leaves an operator-unpaused schedule running when the definition says paused', async () => {
    const { client, schedules } = fakeScheduleClient([
      { ...daily, state: { paused: false } },
    ]);

    await ensureSchedule(client, { ...hourly, state: { paused: true } });

    expect(schedules.get('sync')?.state?.paused).toBe(false);
  });

  it('leaves an operator-paused schedule paused', async () => {
    const { client, schedules } = fakeScheduleClient([
      { ...daily, state: { paused: true } },
    ]);

    await ensureSchedule(client, hourly);

    expect(schedules.get('sync')?.state?.paused).toBe(true);
  });
});
