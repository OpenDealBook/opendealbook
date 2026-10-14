import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { deterministicUuid } from './documenso';

const seeds = Array.from(
  { length: 500 },
  (_, index) => `Signed contracts:${index}`,
);

describe('an id derived from a seed', () => {
  it('is a valid UUID for every seed', () => {
    const invalid = seeds.filter(
      (seed) => !z.uuid().safeParse(deterministicUuid(seed)).success,
    );

    expect(invalid).toEqual([]);
  });

  it('is a version 5, RFC 4122 variant UUID', () => {
    for (const seed of seeds) {
      expect(deterministicUuid(seed)).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    }
  });

  it('is the same every time for the same seed and differs between seeds', () => {
    expect(deterministicUuid('offer-1:loi:0')).toBe(
      deterministicUuid('offer-1:loi:0'),
    );
    expect(new Set(seeds.map(deterministicUuid)).size).toBe(seeds.length);
  });
});
