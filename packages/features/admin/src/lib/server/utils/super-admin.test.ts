import type { SupabaseClient } from '@supabase/supabase-js';

import { describe, expect, it, vi } from 'vitest';

import type { Database } from '@tuckin/supabase';

import {
  getSuperAdminState,
  hasSuperAdminRole,
  isSuperAdmin,
} from './super-admin';

function makeClient(rpc: unknown): SupabaseClient<Database> {
  return { rpc } as unknown as SupabaseClient<Database>;
}

describe('getSuperAdminState', () => {
  it('maps the single row into hasRole and isSuperAdmin', async () => {
    const single = vi
      .fn()
      .mockResolvedValue({ data: { has_role: true, is_super_admin: false } });
    const client = makeClient(vi.fn(() => ({ single })));

    await expect(getSuperAdminState(client)).resolves.toEqual({
      hasRole: true,
      isSuperAdmin: false,
    });
  });
});

describe('isSuperAdmin', () => {
  it('returns the is_super_admin rpc boolean', async () => {
    const client = makeClient(vi.fn().mockResolvedValue({ data: true }));

    await expect(isSuperAdmin(client)).resolves.toBe(true);
  });
});

describe('hasSuperAdminRole', () => {
  it('returns the has_super_admin_role rpc boolean', async () => {
    const client = makeClient(vi.fn().mockResolvedValue({ data: false }));

    await expect(hasSuperAdminRole(client)).resolves.toBe(false);
  });
});
