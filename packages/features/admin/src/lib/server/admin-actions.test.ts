import { describe, expect, it, vi } from 'vitest';

const { from, del, eq, rpc } = vi.hoisted(() => {
  const eq = vi.fn().mockResolvedValue({ error: null });
  const del = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ delete: del }));
  const rpc = vi.fn().mockResolvedValue({ data: true });

  return { from, del, eq, rpc };
});

vi.mock('@tuckin/supabase/server', () => ({
  getSupabaseServerAdminClient: () => ({ from }),
  getSupabaseServerClient: () => ({ rpc }),
}));

vi.mock('@tuckin/next/actions', () => ({
  enhanceAction:
    (fn: (input: unknown, user: unknown) => unknown) => (input: unknown) =>
      fn(input, undefined),
}));

import { deleteAccountAction } from './admin-actions';

describe('deleteAccountAction', () => {
  it('deletes the account through the admin client using the id', async () => {
    await deleteAccountAction({ accountId: 'account-123' });

    expect(rpc).toHaveBeenCalledWith('is_super_admin');
    expect(from).toHaveBeenCalledWith('accounts');
    expect(del).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith('id', 'account-123');
  });

  it('rejects when the caller is not a super admin', async () => {
    rpc.mockResolvedValueOnce({ data: false });

    await expect(
      deleteAccountAction({ accountId: 'account-123' }),
    ).rejects.toThrow();
  });
});
