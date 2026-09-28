import type { Json } from '@odb/supabase';
import { getSupabaseServerAdminClient } from '@odb/supabase/server';

export interface VerifyOtpTokenParams {
  token: string;
  purpose: string;
  requiredScopes?: string[];
  maxVerificationAttempts?: number;
}

export type VerifyOtpTokenResult =
  | {
      valid: true;
      userId: string | null;
      metadata: Json;
      scopes: string[] | null;
      purpose: string;
    }
  | {
      valid: false;
      message: string;
      maxAttemptsExceeded?: boolean;
    };

type VerifyNoncePayload =
  | {
      valid: true;
      user_id: string | null;
      metadata: Json;
      scopes: string[] | null;
      purpose: string;
    }
  | {
      valid: false;
      message: string;
      max_attempts_exceeded?: boolean;
    };

export async function verifyOtpToken({
  token,
  purpose,
  requiredScopes,
  maxVerificationAttempts,
}: VerifyOtpTokenParams): Promise<VerifyOtpTokenResult> {
  const client = getSupabaseServerAdminClient();

  const result = await client.rpc('verify_nonce', {
    token,
    purpose,
    required_scopes: requiredScopes,
    max_verification_attempts: maxVerificationAttempts,
  });

  if (result.error) {
    throw result.error;
  }

  const payload = result.data as VerifyNoncePayload;

  if (payload.valid) {
    return {
      valid: true,
      userId: payload.user_id,
      metadata: payload.metadata,
      scopes: payload.scopes,
      purpose: payload.purpose,
    };
  }

  return {
    valid: false,
    message: payload.message,
    maxAttemptsExceeded: payload.max_attempts_exceeded,
  };
}
