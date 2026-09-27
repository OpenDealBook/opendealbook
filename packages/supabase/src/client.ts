import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './database.types';
import { getSupabaseClientKeys } from './env';

let client: SupabaseClient<Database> | undefined;

export function getSupabaseBrowserClient(): SupabaseClient<Database> {
  if (client) {
    return client;
  }

  const keys = getSupabaseClientKeys();

  client = createBrowserClient<Database>(keys.url, keys.anonKey);

  return client;
}
