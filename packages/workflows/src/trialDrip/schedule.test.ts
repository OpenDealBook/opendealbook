import { describe, expect, it } from 'vitest';

import { trialDripSends } from './schedule';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('trialDripSends', () => {
  it('sends day 1, 3 and 6 templates in order', () => {
    expect(trialDripSends().map((send) => send.dayKey)).toEqual([
      'trial-day-1',
      'trial-day-3',
      'trial-day-6',
    ]);
  });

  it('sleeps the gap since the previous send before each step', () => {
    expect(trialDripSends().map((send) => send.sleepMs)).toEqual([
      1 * DAY_MS,
      2 * DAY_MS,
      3 * DAY_MS,
    ]);
  });
});
