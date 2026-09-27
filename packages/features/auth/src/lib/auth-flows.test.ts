import type { SupabaseClient } from '@supabase/supabase-js';

import { describe, expect, it, vi } from 'vitest';

import { signInWithPassword, signUpWithPassword } from './auth-flows';

function createClient() {
  const signInWithPassword = vi.fn().mockResolvedValue({ error: null });
  const signUp = vi.fn().mockResolvedValue({ error: null });

  return {
    client: {
      auth: { signInWithPassword, signUp },
    } as unknown as SupabaseClient,
    signInWithPassword,
    signUp,
  };
}

describe('signInWithPassword', () => {
  it('calls the supabase auth method with the entered credentials', async () => {
    const { client, signInWithPassword: spy } = createClient();

    await signInWithPassword(client, {
      email: 'person@example.com',
      password: 'supersecret',
    });

    expect(spy).toHaveBeenCalledWith({
      email: 'person@example.com',
      password: 'supersecret',
    });
  });
});

describe('signUpWithPassword', () => {
  it('passes the entered credentials to supabase signUp', async () => {
    const { client, signUp } = createClient();

    await signUpWithPassword(client, {
      email: 'person@example.com',
      password: 'supersecret',
    });

    expect(signUp).toHaveBeenCalledWith({
      email: 'person@example.com',
      password: 'supersecret',
      options: { emailRedirectTo: undefined },
    });
  });
});
