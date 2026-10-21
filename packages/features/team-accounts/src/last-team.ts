import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

export async function rememberLastTeam(
  client: SupabaseClient<Database>,
  userId: string,
  teamId: string,
) {
  await client
    .from('accounts')
    .update({ last_team_account_id: teamId })
    .eq('primary_owner_user_id', userId)
    .eq('is_personal_account', true)
    .or(`last_team_account_id.is.null,last_team_account_id.neq.${teamId}`)
    .throwOnError();
}
