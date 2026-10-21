import { describe, expect, it } from 'vitest';

import { timeZones, zoneChoices } from './time-zones';

describe('zone choices', () => {
  it('offers UTC first, once', () => {
    const choices = zoneChoices('UTC');

    expect(choices[0]).toBe('UTC');
    expect(choices.filter((zone) => zone === 'UTC')).toHaveLength(1);
  });

  it('offers a saved zone missing from the list as itself', () => {
    expect(zoneChoices('Etc/GMT+5')).toEqual(['Etc/GMT+5', ...timeZones]);
  });

  it('offers the plain list when nothing is saved yet', () => {
    expect(zoneChoices(null)).toEqual(timeZones);
  });
});
