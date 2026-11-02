import { describe, expect, it } from 'vitest';

import { fakeScheduleClient } from './fakeScheduleClient';
import { ensureRemovedDocumentTextPurgeSchedule } from './removedDocumentTextPurge';

describe('ensureRemovedDocumentTextPurgeSchedule', () => {
  it('purges the AI text of removed documents every day at 02:00 UTC', async () => {
    const { client, schedules } = fakeScheduleClient();

    await ensureRemovedDocumentTextPurgeSchedule(client);

    expect([...schedules.values()]).toMatchObject([
      {
        spec: { calendars: [{ hour: 2 }] },
        action: {
          type: 'startWorkflow',
          workflowType: 'purgeRemovedDocumentTextNightly',
          taskQueue: 'opendealbook',
        },
      },
    ]);
  });
});
