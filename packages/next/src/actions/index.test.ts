import type { SupabaseClient } from '@supabase/supabase-js';

import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { getSupabaseServerClient } from '@odb/supabase/server';

import { enhanceAction } from './index';

vi.mock('@odb/supabase/server', () => ({
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

  it('explains a write refused because the team is locked', async () => {
    getSupabaseServerClientMock.mockReturnValue(mockClient({ id: 'u1' }));

    const action = enhanceAction(async () => {
      throw Object.assign(new Error('team is read-only'), { code: '42501' });
    });

    await expect(action(undefined)).rejects.toThrow(
      'This team is read-only until billing is updated.',
    );
  });

  it('keeps the message of any other refused write', async () => {
    getSupabaseServerClientMock.mockReturnValue(mockClient({ id: 'u1' }));

    const action = enhanceAction(async () => {
      throw Object.assign(
        new Error('new row violates row-level security policy'),
        { code: '42501' },
      );
    });

    await expect(action(undefined)).rejects.toThrow(
      'new row violates row-level security policy',
    );
  });
});
