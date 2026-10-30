import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { timeZones } from '@odb/accounts/shared';

import { zoneChoices } from './time-zones';

function zonesTheDatabaseAccepts() {
  const schema = readFileSync(
    new URL(
      '../../../../supabase/schemas/99b1-account-timezone.sql',
      import.meta.url,
    ),
    'utf8',
  );
  const list = schema.match(/any \(array\[([^\]]*)\]/)![1]!;
  return [...list.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

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

  it('offers exactly the zones the database accepts, so a Node ICU change fails here', () => {
    expect(zonesTheDatabaseAccepts()).toEqual(timeZones);
  });
});
