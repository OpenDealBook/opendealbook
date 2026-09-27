import type { User } from '@supabase/supabase-js';

import { describe, expect, it } from 'vitest';

import { assertSuperAdmin } from './assert-super-admin';

function makeUser(role?: string): User {
  return { app_metadata: role ? { role } : {} } as User;
}

describe('assertSuperAdmin', () => {
  it('rejects a user without the super-admin role', () => {
    expect(() => assertSuperAdmin(makeUser('member'))).toThrow();
  });

  it('returns the user when the super-admin role is present', () => {
    const user = makeUser('super-admin');

    expect(assertSuperAdmin(user)).toBe(user);
  });
});
