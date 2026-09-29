import type { SupabaseClient } from '@supabase/supabase-js';

import { describe, expect, it, vi } from 'vitest';

import type { Database } from '@odb/supabase';

import { assertTargetUserMutable } from './target-guard';

function makeClient(targetIsSuperAdmin: boolean) {
  const rpc = vi.fn().mockResolvedValue({ data: targetIsSuperAdmin });

  return { client: { rpc } as unknown as SupabaseClient<Database>, rpc };
}

describe('assertTargetUserMutable', () => {
  it('throws when the target is the acting admin', async () => {
    const { client } = makeClient(false);

    await expect(
      assertTargetUserMutable(client, 'user-1', 'user-1'),
    ).rejects.toThrow();
  });

  it('throws when the target is another super admin', async () => {
    const { client, rpc } = makeClient(true);

    await expect(
      assertTargetUserMutable(client, 'user-1', 'user-2'),
    ).rejects.toThrow();

    expect(rpc).toHaveBeenCalledWith('is_user_super_admin', {
      target_user_id: 'user-2',
    });
  });

  it('resolves for an ordinary distinct target', async () => {
    const { client } = makeClient(false);

    await expect(
      assertTargetUserMutable(client, 'user-1', 'user-2'),
    ).resolves.toBeUndefined();
  });
});
