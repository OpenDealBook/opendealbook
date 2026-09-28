import { getSupabaseServerClient } from '@tuckin/supabase/server';

export interface TrialState {
  isActive: boolean;
  endsAt: string | null;
}

export async function loadTrialState(accountId: string): Promise<TrialState> {
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
