import { cookies } from 'next/headers';

import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './database.types';
import { getSupabaseClientKeys, getSupabaseServiceRoleKey } from './env';

export { requireUser } from './require-user';

export function getSupabaseServerClient(): SupabaseClient<Database> {
  const keys = getSupabaseClientKeys();

  return createServerClient<Database>(keys.url, keys.anonKey, {
    cookies: {
      async getAll() {
        const store = await cookies();

        return store.getAll();
      },
      async setAll(cookiesToSet) {
        const store = await cookies();

        cookiesToSet.forEach(({ name, value, options }) =>
          store.set(name, value, options),
        );
      },
    },
  });
}

export function getSupabaseServerAdminClient(): SupabaseClient<Database> {
  const keys = getSupabaseClientKeys();

  return createClient<Database>(keys.url, getSupabaseServiceRoleKey(), {
    auth: {
      persistSession: false,
      detectSessionInUrl: false,
      autoRefreshToken: false,
    },
  });
}
