import { getSupabaseServerClient } from '@odb/supabase/server';

export type MonthlyCap = { cap: number; used: number };

export type MonthlyCapsUsage = {
  letters: MonthlyCap;
  lookups: MonthlyCap;
  ai: MonthlyCap & { resetsAt: string };
};

export async function loadMonthlyCaps(
  accountId: string,
): Promise<MonthlyCapsUsage> {
  const client = getSupabaseServerClient();
  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();
  const nextMonthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  ).toISOString();

  const usedThisMonth = async (table: 'outreach_letter' | 'paid_lookup') => {
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
      .select('letter_monthly_cap, lookup_monthly_cap, ai_monthly_credit_cap')
      .eq('account_id', accountId)
      .maybeSingle(),
    usedThisMonth('outreach_letter'),
    usedThisMonth('paid_lookup'),
    client
      .rpc('ai_credits_used_this_month', { p_account_id: accountId })
      .throwOnError()
      .then(({ data }) => data!),
  ]);

  return {
    letters: { cap: setting?.letter_monthly_cap ?? 0, used: letters },
    lookups: { cap: setting?.lookup_monthly_cap ?? 0, used: lookups },
    ai: {
      cap: setting?.ai_monthly_credit_cap ?? 0,
      used: ai,
      resetsAt: nextMonthStart,
    },
  };
}
