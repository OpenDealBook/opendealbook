import { describe, expect, it, vi } from 'vitest';

const { from, del, eq } = vi.hoisted(() => {
  const eq = vi.fn().mockResolvedValue({ error: null });
  const del = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ delete: del }));

  return { from, del, eq };
});

vi.mock('@tuckin/supabase/server', () => ({
  getSupabaseServerAdminClient: () => ({ from }),
}));

vi.mock('@tuckin/next/actions', () => ({
  enhanceAction:
    (fn: (input: unknown, user: unknown) => unknown) => (input: unknown) =>
      fn(input, { app_metadata: { role: 'super-admin' } }),
}));

import { deleteAccountAction } from './admin-actions';

describe('deleteAccountAction', () => {
  it('deletes the account through the admin client using the id', async () => {
    await deleteAccountAction({ accountId: 'account-123' });

    expect(from).toHaveBeenCalledWith('accounts');
    expect(del).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith('id', 'account-123');
  });
});
