'use server';

import { getSupabaseServerClient } from '@odb/supabase/server';

export async function signedInUserId(): Promise<string | null> {
  const { data } = await getSupabaseServerClient().auth.getUser();

  return data.user?.id ?? null;
}
