import { getSupabaseServerClient } from '@odb/supabase/server';

import featureFlagsConfig from '../../../../config/feature-flags.config';

export interface TrialState {
  isActive: boolean;
  endsAt: string | null;
}

export async function loadTrialState(accountId: string): Promise<TrialState> {
  if (!featureFlagsConfig.enableBilling) {
    return { isActive: true, endsAt: null };
  }

  const client = getSupabaseServerClient();

  const [{ data: isActive }, { data: account }] = await Promise.all([
    client.rpc('is_trial_active', { p_account_id: accountId }),
    client
      .from('accounts')
      .select('trial_ends_at')
      .eq('id', accountId)
      .maybeSingle(),
  ]);

  return {
    isActive: isActive ?? false,
    endsAt: account?.trial_ends_at ?? null,
  };
}
