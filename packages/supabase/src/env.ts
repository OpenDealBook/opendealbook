import { requireEnv } from '@tuckin/shared/env';

export function getSupabaseClientKeys() {
  return {
    url: requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    anonKey: requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  };
}

export function getSupabaseServiceRoleKey() {
  return requireEnv('SUPABASE_SERVICE_ROLE_KEY');
}
