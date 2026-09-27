import { getSupabaseServerAdminClient } from '@tuckin/supabase/server';

export interface CreateOtpTokenParams {
  purpose: string;
  userId?: string;
  accountId?: string;
  expiresInSeconds?: number;
}

export async function createOtpToken({
  purpose,
  userId,
  accountId,
  expiresInSeconds,
}: CreateOtpTokenParams): Promise<string> {
  const client = getSupabaseServerAdminClient();

  const { data, error } = await client.rpc('create_nonce', {
    purpose,
    user_id: userId,
    account_id: accountId,
    expires_in_seconds: expiresInSeconds,
  });

  if (error) {
    throw error;
  }

  return data;
}
