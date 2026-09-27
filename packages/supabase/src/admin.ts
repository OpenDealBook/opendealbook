import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './database.types';
import { getSupabaseClientKeys, getSupabaseServiceRoleKey } from './env';

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
