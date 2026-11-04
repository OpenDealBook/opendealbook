import { describe, expect, it } from 'vitest';

import { formatBytes } from './format';

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [999, '999 B'],
    [1023, '1,023 B'],
    [1024, '1 KB'],
    [1536, '1.5 KB'],
    [5 * 1024 * 1024, '5 MB'],
    [2.25 * 1024 * 1024, '2.3 MB'],
    [1.5 * 1024 ** 3, '1.5 GB'],
    [3 * 1024 ** 4, '3 TB'],
  ])('shows %d bytes as %s', (bytes, shown) => {
    expect(formatBytes(bytes)).toBe(shown);
  });
});
