import { describe, expect, it } from 'vitest';

import { fakeScheduleClient } from './fakeScheduleClient';
import { ensureFloridaLicenseSchedule } from './floridaLicenses';

describe('ensureFloridaLicenseSchedule', () => {
  it('imports the Florida license files every night', async () => {
    const { client, schedules } = fakeScheduleClient();

    await ensureFloridaLicenseSchedule(client);

    expect(schedules.get('florida-licenses-import')).toMatchObject({
      spec: { calendars: [{ hour: 7 }] },
      action: { type: 'startWorkflow', workflowType: 'importFloridaLicenses', args: [] },
    });
  });
});
