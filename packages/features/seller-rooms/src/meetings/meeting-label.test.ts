import { describe, expect, it } from 'vitest';

import { meetingLabel } from './meeting-label';

describe('meetingLabel', () => {
  it('names a meeting by its kind and day', () => {
    expect(
      meetingLabel({ type: 'weekly', scheduled_at: '2026-10-01T10:00:00Z' }),
    ).toBe('Weekly meeting, Oct 1, 2026');
  });

  it('leaves the day out when the meeting has none', () => {
    expect(meetingLabel({ type: 'site_visit', scheduled_at: null })).toBe(
      'Site visit',
    );
  });
});
