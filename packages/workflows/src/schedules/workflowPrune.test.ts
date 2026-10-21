import { describe, expect, it } from 'vitest';

import { fakeScheduleClient, staleSchedule } from './fakeScheduleClient';
import { ensureWorkflowPruneSchedule } from './workflowPrune';

describe('ensureWorkflowPruneSchedule', () => {
  it('runs the step data prune workflow every day at 03:00 UTC', async () => {
    const { client, schedules } = fakeScheduleClient();

    await ensureWorkflowPruneSchedule(client);

    expect(schedules.get('workflow-step-data-prune')).toMatchObject({
      spec: { calendars: [{ hour: 3 }] },
      action: {
        type: 'startWorkflow',
        workflowType: 'pruneWorkflowStepDataDaily',
        taskQueue: 'opendealbook',
      },
    });
  });

  it('applies the current spec to an existing schedule', async () => {
    const { client, schedules } = fakeScheduleClient([
      { ...staleSchedule, scheduleId: 'workflow-step-data-prune' },
    ]);

    await ensureWorkflowPruneSchedule(client);

    expect(schedules.get('workflow-step-data-prune')?.spec).toEqual({ calendars: [{ hour: 3 }] });
  });
});
