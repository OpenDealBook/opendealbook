import { describe, expect, it } from 'vitest';

import { screeningListSkip } from './snapshot';

const now = new Date('2026-10-27T12:00:00Z');

describe('screeningListSkip', () => {
  it('skips screening before any import has succeeded', () => {
    expect(screeningListSkip(null, now)).toBe('The sanctions list is not loaded yet');
  });

  it('skips screening when the current import holds no entries', () => {
    expect(
      screeningListSkip({ startedAt: '2026-10-26T06:00:00+00:00', entries: 0 }, now),
    ).toBe('The sanctions list is not loaded yet');
  });

  it('skips screening when the newest import is more than 14 days old', () => {
    expect(
      screeningListSkip({ startedAt: '2026-10-13T11:59:59.999Z', entries: 26173 }, now),
    ).toBe('The sanctions list is out of date');
  });

  it('screens against an import exactly 14 days old', () => {
    expect(
      screeningListSkip({ startedAt: '2026-10-13T12:00:00Z', entries: 26173 }, now),
    ).toBeNull();
  });

  it('screens against a recent import', () => {
    expect(
      screeningListSkip({ startedAt: '2026-10-26T06:00:00+00:00', entries: 26173 }, now),
    ).toBeNull();
  });
});
