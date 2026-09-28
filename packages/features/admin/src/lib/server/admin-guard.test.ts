import type { SupabaseClient } from '@supabase/supabase-js';

import { describe, expect, it, vi } from 'vitest';

import type { Database } from '@odb/supabase';

import { adminGuard } from './admin-guard';

function makeClient(row: {
  has_role: boolean;
  is_super_admin: boolean;
}): SupabaseClient<Database> {
  const single = vi.fn().mockResolvedValue({ data: row });

  return {
    rpc: vi.fn(() => ({ single })),
  } as unknown as SupabaseClient<Database>;
}

describe('adminGuard', () => {
  it('forbids a user without the super-admin role', async () => {
    const client = makeClient({ has_role: false, is_super_admin: false });

    await expect(adminGuard(client)).resolves.toEqual({ status: 'forbidden' });
  });

  it('requires mfa when the role is present but the strict gate fails', async () => {
    const client = makeClient({ has_role: true, is_super_admin: false });

    await expect(adminGuard(client)).resolves.toEqual({ status: 'needs-mfa' });
  });

  it('allows a full super-admin', async () => {
    const client = makeClient({ has_role: true, is_super_admin: true });

    await expect(adminGuard(client)).resolves.toEqual({ status: 'ok' });
  });
});
