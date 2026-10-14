import { describe, expect, it } from 'vitest';

import { endOfDayIn, isTimeZone } from './end-of-day';

describe('endOfDayIn', () => {
  it('ends a winter day in Chicago at 11:59 PM central standard time', () => {
    expect(endOfDayIn({ date: '2027-01-15', timeZone: 'America/Chicago' })).toBe(
      '2027-01-16T05:59:59.999Z',
    );
  });

  it('ends a summer day in Chicago at 11:59 PM central daylight time', () => {
    expect(endOfDayIn({ date: '2027-07-15', timeZone: 'America/Chicago' })).toBe(
      '2027-07-16T04:59:59.999Z',
    );
  });

  it('ends a day in Tokyo at 11:59 PM Japan time, earlier the same UTC day', () => {
    expect(endOfDayIn({ date: '2027-01-15', timeZone: 'Asia/Tokyo' })).toBe(
      '2027-01-15T14:59:59.999Z',
    );
  });

  it('ends the New York spring-forward day on daylight time', () => {
    expect(
      endOfDayIn({ date: '2026-03-08', timeZone: 'America/New_York' }),
    ).toBe('2026-03-09T03:59:59.999Z');
  });

  it('ends the New York fall-back day on standard time', () => {
    expect(
      endOfDayIn({ date: '2026-11-01', timeZone: 'America/New_York' }),
    ).toBe('2026-11-02T04:59:59.999Z');
  });
});

describe('isTimeZone', () => {
  it('accepts an IANA zone', () => {
    expect(isTimeZone('America/Chicago')).toBe(true);
  });

  it('rejects a name that is not a zone', () => {
    expect(isTimeZone('Mars/Olympus_Mons')).toBe(false);
  });
});
