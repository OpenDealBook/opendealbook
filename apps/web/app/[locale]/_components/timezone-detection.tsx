import { getSupabaseServerClient } from '@odb/supabase/server';

import { DetectTimezone } from './detect-timezone';

export async function TimezoneDetection() {
  const client = getSupabaseServerClient();

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: account } = await client
    .from('accounts')
    .select('timezone')
    .eq('id', user.id)
    .single()
    .throwOnError();

  return account.timezone ? null : <DetectTimezone />;
}
