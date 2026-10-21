import type { SupabaseClient, User } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

const SIGN_IN_PATH = '/auth/sign-in';

export const TEAM_READ_ONLY = 'This team is read-only until billing is updated.';

type RequireUserResult = { data: User } | { error: string; redirectTo: string };

export async function requireUserInRouteHandler(
  client: SupabaseClient<Database>,
): Promise<RequireUserResult> {
  const { data, error } = await client.auth.getUser();

  if (error || !data.user) {
    return { error: 'Authentication required', redirectTo: SIGN_IN_PATH };
  }

  return { data: data.user };
}
