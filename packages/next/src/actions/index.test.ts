import type { SupabaseClient } from '@supabase/supabase-js';

import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { getSupabaseServerClient } from '@tuckin/supabase/server';

import { enhanceAction } from './index';

vi.mock('@tuckin/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(),
}));

const getSupabaseServerClientMock = vi.mocked(getSupabaseServerClient);

function mockClient(user: unknown) {
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user }, error: null })),
    },
  } as unknown as SupabaseClient;
}

describe('enhanceAction', () => {
  it('rejects when unauthenticated and auth is required', async () => {
    getSupabaseServerClientMock.mockReturnValue(mockClient(null));

    const action = enhanceAction(async () => 'ok');

    await expect(action(undefined)).rejects.toThrow();
  });

  it('validates the input against the schema', async () => {
    getSupabaseServerClientMock.mockReturnValue(mockClient({ id: 'u1' }));

    const action = enhanceAction(
      async (input: { name: string }) => input.name,
      { schema: z.object({ name: z.string() }) },
    );

    await expect(action({ name: 1 } as never)).rejects.toThrow();
  });

  it('passes the authenticated user to the action', async () => {
    const user = { id: 'u1' };
    getSupabaseServerClientMock.mockReturnValue(mockClient(user));

    const received = vi.fn(async (_input: string, _user: unknown) => 'ok');
    const action = enhanceAction((input: string, u) => received(input, u));

    await action('hello');

    expect(received).toHaveBeenCalledWith('hello', user);
  });
});
