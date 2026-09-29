import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  serverRpc: vi.fn(),
  adminRpc: vi.fn(),
  updateUserById: vi.fn(),
  insert: vi.fn(),
  del: vi.fn(),
  ownerId: 'owner-1',
}));

vi.mock('@odb/supabase/server', () => {
  const single = () =>
    Promise.resolve({ data: { primary_owner_user_id: state.ownerId } });

  const adminClient = {
    from: (table: string) => ({
      select: () => ({ eq: () => ({ single }) }),
      delete: () => ({
        eq: (...args: unknown[]) => {
          state.del(...args);

          return Promise.resolve({ error: null });
        },
      }),
      insert: (row: unknown) => {
        state.insert(table, row);

        return Promise.resolve({ error: null });
      },
    }),
    rpc: state.adminRpc,
    auth: { admin: { updateUserById: state.updateUserById } },
  };

  return {
    getSupabaseServerAdminClient: () => adminClient,
    getSupabaseServerClient: () => ({ rpc: state.serverRpc }),
  };
});

vi.mock('@odb/next/actions', () => ({
  enhanceAction:
    (fn: (input: unknown, user: unknown) => unknown) => (input: unknown) =>
      fn(input, { id: 'actor-1' }),
}));

import {
  banUserAction,
  deleteAccountAction,
  reactivateUserAction,
} from './admin-actions';

beforeEach(() => {
  state.serverRpc.mockResolvedValue({ data: true });
  state.adminRpc.mockResolvedValue({ data: false });
  state.updateUserById.mockReset();
  state.updateUserById.mockResolvedValue({ error: null });
  state.insert.mockClear();
  state.del.mockClear();
  state.adminRpc.mockClear();
  state.ownerId = 'owner-1';
});

describe('deleteAccountAction', () => {
  it('deletes the account and appends an audit row', async () => {
    await deleteAccountAction({ accountId: 'account-123' });

    expect(state.del).toHaveBeenCalledWith('id', 'account-123');
    expect(state.insert).toHaveBeenCalledWith(
      'admin_action_log',
      expect.objectContaining({
        actor_user_id: 'actor-1',
        action: 'account.delete',
        target_type: 'account',
        target_id: 'account-123',
      }),
    );
  });

  it('rejects when the caller is not a super admin', async () => {
    state.serverRpc.mockResolvedValue({ data: false });

    await expect(
      deleteAccountAction({ accountId: 'account-123' }),
    ).rejects.toThrow();
  });

  it('refuses to delete an account owned by a super admin', async () => {
    state.adminRpc.mockResolvedValue({ data: true });

    await expect(
      deleteAccountAction({ accountId: 'account-123' }),
    ).rejects.toThrow();
    expect(state.del).not.toHaveBeenCalled();
  });

  it('refuses to delete the acting admin own account', async () => {
    state.ownerId = 'actor-1';

    await expect(
      deleteAccountAction({ accountId: 'account-123' }),
    ).rejects.toThrow();
    expect(state.del).not.toHaveBeenCalled();
  });
});

describe('banUserAction', () => {
  it('bans the user and appends an audit row', async () => {
    await banUserAction({ userId: 'user-9' });

    expect(state.updateUserById).toHaveBeenCalledWith('user-9', {
      ban_duration: '876000h',
    });
    expect(state.insert).toHaveBeenCalledWith(
      'admin_action_log',
      expect.objectContaining({
        actor_user_id: 'actor-1',
        action: 'user.ban',
        target_type: 'user',
        target_id: 'user-9',
      }),
    );
  });

  it('refuses to ban the acting admin', async () => {
    await expect(banUserAction({ userId: 'actor-1' })).rejects.toThrow();
    expect(state.updateUserById).not.toHaveBeenCalled();
  });

  it('refuses to ban another super admin', async () => {
    state.adminRpc.mockResolvedValue({ data: true });

    await expect(banUserAction({ userId: 'user-9' })).rejects.toThrow();
    expect(state.updateUserById).not.toHaveBeenCalled();
  });
});

describe('reactivateUserAction', () => {
  it('reactivates the user and appends an audit row', async () => {
    await reactivateUserAction({ userId: 'user-9' });

    expect(state.updateUserById).toHaveBeenCalledWith('user-9', {
      ban_duration: 'none',
    });
    expect(state.insert).toHaveBeenCalledWith(
      'admin_action_log',
      expect.objectContaining({
        actor_user_id: 'actor-1',
        action: 'user.reactivate',
        target_type: 'user',
        target_id: 'user-9',
      }),
    );
  });
});
