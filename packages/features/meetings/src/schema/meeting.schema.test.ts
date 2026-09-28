import { describe, expect, it } from 'vitest';

import { scheduleMeetingSchema } from './meeting.schema';

const base = {
  account_id: '11111111-1111-4111-8111-111111111111',
  deal_id: '22222222-2222-4222-8222-222222222222',
  type: 'weekly' as const,
};

describe('scheduleMeetingSchema status', () => {
  it('rejects a status outside the meeting_status enum', () => {
    const result = scheduleMeetingSchema.safeParse({ ...base, status: 'bogus' });

    expect(result.success).toBe(false);
  });

  it('accepts held and skipped as valid statuses', () => {
    expect(
      scheduleMeetingSchema.safeParse({ ...base, status: 'held' }).success,
    ).toBe(true);
    expect(
      scheduleMeetingSchema.safeParse({ ...base, status: 'skipped' }).success,
    ).toBe(true);
  });
});
