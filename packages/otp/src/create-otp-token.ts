import { getSupabaseServerAdminClient } from '@odb/supabase/server';

export interface CreateOtpTokenParams {
  purpose: string;
  userId?: string;
  accountId?: string;
  expiresInSeconds?: number;
  scopes?: string[];
}

export async function createOtpToken({
  purpose,
  userId,
  accountId,
  expiresInSeconds,
  scopes,
}: CreateOtpTokenParams): Promise<string> {
  const client = getSupabaseServerAdminClient();

  const { data, error } = await client.rpc('create_nonce', {
    purpose,
    user_id: userId,
    account_id: accountId,
    expires_in_seconds: expiresInSeconds,
    scopes,
  });

  if (error) {
    throw error;
  }

  return data;
}
