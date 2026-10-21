import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

export function shortDate(at: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
  }).format(new Date(at));
}

export async function timezonesOf(
  admin: SupabaseClient<Database>,
  userIds: string[],
): Promise<(userId: string) => string> {
  const { data } = await admin
    .from('accounts')
    .select('id, timezone')
    .in('id', userIds)
    .throwOnError();
  const byId = new Map(data.map((account) => [account.id, account.timezone]));

  return (userId) => byId.get(userId) ?? 'UTC';
}
