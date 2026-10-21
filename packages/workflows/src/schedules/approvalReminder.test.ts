import { describe, expect, it } from 'vitest';

import { ensureApprovalReminderSchedule } from './approvalReminder';
import { fakeScheduleClient, staleSchedule } from './fakeScheduleClient';

describe('ensureApprovalReminderSchedule', () => {
  it('checks for waiting approvals every hour so each team is reminded at its own 09:00', async () => {
    const { client, schedules } = fakeScheduleClient();

    await ensureApprovalReminderSchedule(client);

    expect(schedules.get('workflow-approval-reminder')).toMatchObject({
      spec: { intervals: [{ every: '1h' }] },
      action: {
        type: 'startWorkflow',
        workflowType: 'sendApprovalReminders',
        taskQueue: 'opendealbook',
      },
    });
  });

  it('applies the current spec to an existing schedule', async () => {
    const { client, schedules } = fakeScheduleClient([
      { ...staleSchedule, scheduleId: 'workflow-approval-reminder' },
    ]);

    await ensureApprovalReminderSchedule(client);

    expect(schedules.get('workflow-approval-reminder')?.spec).toEqual({
      intervals: [{ every: '1h' }],
    });
  });
});
