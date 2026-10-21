import { describe, expect, it, vi } from 'vitest';

vi.mock('@odb/next/actions', () => ({
  enhanceAction: (fn: (data: unknown, user: { id: string }) => unknown) =>
    (data: unknown) => fn(data, { id: 'user-1' }),
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => {
    throw new Error('a refused to-do never reaches the database');
  },
  getSupabaseServerAdminClient: () => {
    throw new Error('a refused to-do never reaches the database');
  },
}));

import { createTodo } from './todo-actions';

describe('createTodo', () => {
  it('refuses a to-do with no title', async () => {
    const result = await createTodo({
      account_id: '00000000-0000-4000-8000-0000000000a1',
      deal_id: '00000000-0000-4000-8000-0000000000d1',
      title: '',
      assignee_user_id: '00000000-0000-4000-8000-0000000000b1',
    });

    expect(result).toMatchObject({ ok: false });
  });
});
