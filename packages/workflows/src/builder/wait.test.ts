import { describe, expect, it } from 'vitest';

import { wakeAt } from './wait';

const started = new Date('2026-10-21T15:30:00Z');

describe('when a wait wakes', () => {
  it('adds a duration to when the step started', () => {
    expect(wakeAt({ kind: 'duration', amount: 2, unit: 'hours' }, started, 'UTC')).toEqual(
      new Date('2026-10-21T17:30:00Z'),
    );
    expect(wakeAt({ kind: 'duration', amount: 3, unit: 'days' }, started, 'UTC')).toEqual(
      new Date('2026-10-24T15:30:00Z'),
    );
  });

  it('uses a full date and time as given', () => {
    expect(
      wakeAt({ kind: 'until', until: '2026-11-02T08:15:00-05:00' }, started, 'Asia/Tokyo'),
    ).toEqual(new Date('2026-11-02T13:15:00Z'));
  });

  it("wakes a plain date at 09:00 in the team's time zone, across daylight saving", () => {
    expect(wakeAt({ kind: 'until', until: '2026-07-01' }, started, 'America/New_York')).toEqual(
      new Date('2026-07-01T13:00:00Z'),
    );
    expect(wakeAt({ kind: 'until', until: '2026-11-02' }, started, 'America/New_York')).toEqual(
      new Date('2026-11-02T14:00:00Z'),
    );
    expect(wakeAt({ kind: 'until', until: '2026-11-02' }, started, 'Asia/Kolkata')).toEqual(
      new Date('2026-11-02T03:30:00Z'),
    );
  });
});
