import type { Client } from '@temporalio/client';

import { describe, expect, it, vi } from 'vitest';

import { ensureOutreachReplySyncSchedule } from './replySyncSchedule';

describe('ensureOutreachReplySyncSchedule', () => {
  it('schedules the outreach reply sync workflow every hour', async () => {
    const create = vi.fn();

    await ensureOutreachReplySyncSchedule({ schedule: { create } } as unknown as Client);

    const options = create.mock.calls[0]![0];
    expect(options.scheduleId).toBe('outreach-reply-sync');
    expect(options.spec.intervals).toEqual([{ every: '1h' }]);
    expect(options.action.workflowType).toBe('syncOutreachRepliesHourly');
  });
});
