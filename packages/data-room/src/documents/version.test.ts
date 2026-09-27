import { describe, expect, it } from 'vitest';

import { nextVersion } from './version';

describe('nextVersion', () => {
  it('starts at 1 when no prior versions exist', () => {
    expect(nextVersion([])).toBe(1);
  });

  it('increments past the highest existing version', () => {
    expect(nextVersion([1, 2, 3])).toBe(4);
  });

  it('increments past the highest even when versions are unordered', () => {
    expect(nextVersion([3, 1, 2])).toBe(4);
  });
});
