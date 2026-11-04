import { expect, it } from 'vitest';

import { pickTimeZone } from './viewer-time-zone';

it('prefers the viewer time zone over the team time zone', () => {
  expect(
    pickTimeZone({ personal: 'America/Denver', team: 'America/New_York' }),
  ).toBe('America/Denver');
});

it('falls back to the team time zone when the viewer has none', () => {
  expect(pickTimeZone({ personal: null, team: 'America/New_York' })).toBe(
    'America/New_York',
  );
});

it('uses UTC when neither is set', () => {
  expect(pickTimeZone({ personal: null, team: null })).toBe('UTC');
});
