import { getSupabaseServerAdminClient } from '@tuckin/supabase/server';

export interface VerifyOtpTokenParams {
  token: string;
  purpose: string;
}

export interface VerifyOtpTokenResult {
  valid: boolean;
  userId?: string;
  accountId?: string;
}

export async function verifyOtpToken({
  token,
  purpose,
}: VerifyOtpTokenParams): Promise<VerifyOtpTokenResult> {
  const client = getSupabaseServerAdminClient();

  const { error } = await client.rpc('verify_nonce', { token, purpose });

  return { valid: !error };
}
