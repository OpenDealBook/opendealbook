import { TEAM_READ_ONLY } from '@odb/next';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { Refusal } from './refusal';

export async function refuseWhileTeamLocked(accountId: string): Promise<void> {
  const { data: locked } = await getSupabaseServerClient()
    .rpc('is_account_locked', { target_account_id: accountId })
    .throwOnError();

  if (locked) {
    throw new Refusal(TEAM_READ_ONLY);
  }
}
