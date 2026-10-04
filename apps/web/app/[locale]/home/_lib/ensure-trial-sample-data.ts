import { hasSampleData, seedSampleDeals } from '@odb/seed';
import { getSupabaseServerClient } from '@odb/supabase/server';

type Client = ReturnType<typeof getSupabaseServerClient>;

export async function ensureTrialSampleData(
  client: Client,
  { accountId, userId }: { accountId: string; userId: string },
): Promise<void> {
  const { data: isActive } = await client.rpc('is_trial_active', {
    p_account_id: accountId,
  });

  if (!isActive || (await hasSampleData(accountId))) {
    return;
  }

  await seedSampleDeals({ accountId, userId });
}
