export function getSupabaseClientKeys() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) {
    throw new Error(
      'Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL',
    );
  }

  if (!anonKey) {
    throw new Error(
      'Missing required environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY',
    );
  }

  return { url, anonKey };
}

export function getSupabaseServiceRoleKey() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error(
      'Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY',
    );
  }

  return serviceRoleKey;
}
