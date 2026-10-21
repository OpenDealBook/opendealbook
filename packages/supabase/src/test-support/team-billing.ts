import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../database.types';

import assert from 'node:assert/strict';

export async function turnTeamBillingOn(
  admin: SupabaseClient<Database>,
): Promise<void> {
  await admin.rpc('set_team_account_billing', { enabled: true }).throwOnError();

  const { data: config } = await admin
    .from('config')
    .select('enable_team_account_billing')
    .single()
    .throwOnError();

  assert.equal(config.enable_team_account_billing, true);
}
