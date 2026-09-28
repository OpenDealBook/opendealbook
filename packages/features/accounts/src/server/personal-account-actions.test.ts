import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const updateSpy = vi.fn();
  const eqSpy = vi.fn();
  const builder: Record<string, unknown> = {};

  builder.update = (payload: unknown) => {
    updateSpy(payload);
    return builder;
  };
  builder.eq = (column: string, value: unknown) => {
    eqSpy(column, value);
    return builder;
  };
  builder.throwOnError = () => Promise.resolve({ data: null, error: null });

  const from = vi.fn(() => builder);

  return { updateSpy, eqSpy, from };
});

vi.mock('@odb/next/actions', () => ({
  enhanceAction: (fn: unknown) => fn,
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({ from: mocks.from }),
  getSupabaseServerAdminClient: () => ({
    auth: { admin: { deleteUser: vi.fn() } },
  }),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { updatePersonalAccountNameAction } from './personal-account-actions';

const runAction = updatePersonalAccountNameAction as unknown as (
  data: { name: string },
  user: { id: string },
) => Promise<unknown>;

describe('updatePersonalAccountNameAction', () => {
  it('updates the account name scoped to the authenticated personal account', async () => {
    await runAction({ name: 'New Name' }, { id: 'user-1' });

    expect(mocks.updateSpy).toHaveBeenCalledWith({ name: 'New Name' });
    expect(mocks.eqSpy).toHaveBeenCalledWith('primary_owner_user_id', 'user-1');
    expect(mocks.eqSpy).toHaveBeenCalledWith('is_personal_account', true);
  });
});
