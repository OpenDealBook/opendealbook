import { getSupabaseServerClient } from '@odb/supabase/server';

export type MonthlyCap = { cap: number; used: number };

export type MonthlyCapsUsage = {
  letters: MonthlyCap;
  lookups: MonthlyCap;
  ai: MonthlyCap;
};

export async function loadMonthlyCaps(
  accountId: string,
): Promise<MonthlyCapsUsage> {
  const client = getSupabaseServerClient();
  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();

  const usedThisMonth = async (
    table: 'outreach_letter' | 'paid_lookup' | 'ai_call_log',
  ) => {
    const { count } = await client
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .gte('created_at', monthStart)
      .throwOnError();

    return count!;
  };

  const [{ data: setting }, letters, lookups, ai] = await Promise.all([
    client
      .from('outreach_setting')
      .select('letter_monthly_cap, lookup_monthly_cap, ai_monthly_cap')
      .eq('account_id', accountId)
      .maybeSingle(),
    usedThisMonth('outreach_letter'),
    usedThisMonth('paid_lookup'),
    usedThisMonth('ai_call_log'),
  ]);

  return {
    letters: { cap: setting?.letter_monthly_cap ?? 0, used: letters },
    lookups: { cap: setting?.lookup_monthly_cap ?? 0, used: lookups },
    ai: { cap: setting?.ai_monthly_cap ?? 0, used: ai },
  };
}
