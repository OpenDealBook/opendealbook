import type { SupabaseClient, User } from '@supabase/supabase-js';

const DEFAULT_SIGN_IN_PATH = '/auth/sign-in';

type RequireUserResult =
  | { data: User; error: null }
  | { data: null; error: Error; redirectTo: string };

export async function requireUser(
  client: SupabaseClient,
): Promise<RequireUserResult> {
  const { data, error } = await client.auth.getUser();

  if (error || !data.user) {
    return {
      data: null,
      error: new Error('Authentication required'),
      redirectTo: DEFAULT_SIGN_IN_PATH,
    };
  }

  return { data: data.user, error: null };
}
