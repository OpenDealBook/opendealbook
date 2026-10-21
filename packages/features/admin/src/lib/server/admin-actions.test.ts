import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  serverRpc: vi.fn(),
  adminRpc: vi.fn(),
  updateUserById: vi.fn(),
  insert: vi.fn(),
  del: vi.fn(),
  deletedFrom: [] as string[],
  deleteFails: false,
  upsert: vi.fn(),
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
          state.deletedFrom.push(table);
          state.del(...args);

          return Object.assign(Promise.resolve({ error: null }), {
            throwOnError: () =>
              state.deleteFails
                ? Promise.reject(new Error('delete failed'))
                : Promise.resolve({ error: null }),
          });
        },
      }),
      insert: (row: unknown) => {
        state.insert(table, row);

        return Promise.resolve({ error: null });
      },
      upsert: (row: unknown) => {
        state.upsert(table, row);

        return { throwOnError: () => Promise.resolve({ error: null }) };
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
  setSellerSendLimitAction,
} from './admin-actions';
import { SellerSendLimitSchema } from './schemas';

beforeEach(() => {
  state.serverRpc.mockResolvedValue({ data: true });
  state.adminRpc.mockResolvedValue({ data: false });
  state.updateUserById.mockReset();
  state.updateUserById.mockResolvedValue({ error: null });
  state.insert.mockClear();
  state.del.mockClear();
  state.deletedFrom = [];
  state.deleteFails = false;
  state.upsert.mockClear();
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

describe('setSellerSendLimitAction', () => {
  const accountId = '6f1c2d3e-4a5b-4c6d-8e7f-90a1b2c3d4e5';

  it('sets the team value and appends an audit row', async () => {
    await setSellerSendLimitAction({ accountId, dailyLimit: 25 });

    expect(state.upsert).toHaveBeenCalledWith('seller_send_limit', {
      account_id: accountId,
      daily_limit: 25,
    });
    expect(state.insert).toHaveBeenCalledWith(
      'admin_action_log',
      expect.objectContaining({
        actor_user_id: 'actor-1',
        action: 'account.seller_send_limit',
        target_type: 'account',
        target_id: accountId,
        detail: { dailyLimit: 25 },
      }),
    );
  });

  it('clears the team value so the defaults apply again', async () => {
    await setSellerSendLimitAction({ accountId, dailyLimit: null });

    expect(state.upsert).not.toHaveBeenCalled();
    expect(state.deletedFrom).toEqual(['seller_send_limit']);
    expect(state.del).toHaveBeenCalledWith('account_id', accountId);
    expect(state.insert).toHaveBeenCalledWith(
      'admin_action_log',
      expect.objectContaining({ detail: { dailyLimit: null } }),
    );
  });

  it('does not record a reset that failed', async () => {
    state.deleteFails = true;

    await expect(
      setSellerSendLimitAction({ accountId, dailyLimit: null }),
    ).rejects.toThrow('delete failed');
    expect(state.insert).not.toHaveBeenCalledWith('admin_action_log', expect.anything());
  });

  it('accepts zero, which blocks sending', async () => {
    await setSellerSendLimitAction({ accountId, dailyLimit: 0 });

    expect(state.upsert).toHaveBeenCalledWith('seller_send_limit', {
      account_id: accountId,
      daily_limit: 0,
    });
  });

  it('refuses a negative or fractional value', () => {
    expect(
      SellerSendLimitSchema.safeParse({ accountId, dailyLimit: -1 }).success,
    ).toBe(false);
    expect(
      SellerSendLimitSchema.safeParse({ accountId, dailyLimit: 2.5 }).success,
    ).toBe(false);
  });

  it('rejects when the caller is not a super admin', async () => {
    state.serverRpc.mockResolvedValue({ data: false });

    await expect(
      setSellerSendLimitAction({ accountId, dailyLimit: 25 }),
    ).rejects.toThrow();
    expect(state.upsert).not.toHaveBeenCalled();
  });
});
