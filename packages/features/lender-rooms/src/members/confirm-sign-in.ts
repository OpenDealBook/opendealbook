import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

import { safeNextPath } from './entry-rules';

export async function confirmSignIn(
  client: SupabaseClient<Database>,
  { tokenHash, next }: { tokenHash: string; next: string | null },
): Promise<{ kind: 'signed-in'; next: string } | { kind: 'expired' }> {
  const { error } = await client.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  });

  return error
    ? { kind: 'expired' }
    : { kind: 'signed-in', next: safeNextPath(next) };
}
