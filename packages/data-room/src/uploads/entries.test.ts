import { describe, expect, it } from 'vitest';

import { zipEntriesFromMap } from './entries';

const bytes = (n: number) => new Uint8Array([n]);

describe('zipEntriesFromMap', () => {
  it('skips directory entries', () => {
    const entries = zipEntriesFromMap({
      'reports/': bytes(0),
      'reports/q1.pdf': bytes(1),
    });

    expect(entries.map((entry) => entry.originalPath)).toEqual([
      'reports/q1.pdf',
    ]);
  });

  it('preserves the original relative path of each file', () => {
    const entries = zipEntriesFromMap({
      'a/b/c.txt': bytes(2),
      'top.txt': bytes(3),
    });

    expect(entries.map((entry) => entry.originalPath).sort()).toEqual([
      'a/b/c.txt',
      'top.txt',
    ]);
  });
});
