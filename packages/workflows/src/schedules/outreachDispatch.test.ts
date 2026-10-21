import { describe, expect, it } from 'vitest';

import { fakeScheduleClient, staleSchedule } from './fakeScheduleClient';
import { ensureOutreachDispatchSchedule } from './outreachDispatch';

describe('ensureOutreachDispatchSchedule', () => {
  it('creates the 30-minute dispatch schedule paused', async () => {
    const { client, schedules } = fakeScheduleClient();

    await ensureOutreachDispatchSchedule(client);

    expect(schedules.get('outreach-dispatch')).toMatchObject({
      spec: { intervals: [{ every: '30 minutes' }] },
      action: { workflowType: 'outreachDispatch' },
      state: { paused: true },
    });
  });

  it('keeps an operator-unpaused schedule running while applying the current spec', async () => {
    const { client, schedules } = fakeScheduleClient([
      { ...staleSchedule, scheduleId: 'outreach-dispatch', state: { paused: false } },
    ]);

    await ensureOutreachDispatchSchedule(client);

    expect(schedules.get('outreach-dispatch')).toMatchObject({
      spec: { intervals: [{ every: '30 minutes' }] },
      state: { paused: false },
    });
  });
});
