import {
  type SupabaseClient,
  type User,
  isAuthSessionMissingError,
} from '@supabase/supabase-js';

export async function signedInUser(client: SupabaseClient): Promise<User | null> {
  const { data, error } = await client.auth.getUser();

  if (
    error &&
    !isAuthSessionMissingError(error) &&
    error.status !== 401 &&
    error.status !== 403
  ) {
    throw error;
  }

  return data.user;
}
