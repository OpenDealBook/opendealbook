import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

export async function isTeamLocked(input: {
  accountId: string;
}): Promise<boolean> {
  const { data, error } = await getSupabaseServerAdminClient().rpc(
    'is_account_locked',
    { target_account_id: input.accountId },
  );

  if (error) {
    throw error;
  }

  return data;
}
