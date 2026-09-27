import { describe, expect, it } from 'vitest';

import { isAccountOwner } from './ownership';

describe('isAccountOwner', () => {
  it('is true when the user id matches the account owner id', () => {
    expect(isAccountOwner('user-1', 'user-1')).toBe(true);
  });

  it('is false when the ids differ', () => {
    expect(isAccountOwner('user-1', 'user-2')).toBe(false);
  });
});
