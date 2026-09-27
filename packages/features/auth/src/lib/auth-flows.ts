import type { Provider, SupabaseClient } from '@supabase/supabase-js';

export function signInWithPassword(
  client: SupabaseClient,
  credentials: { email: string; password: string },
) {
  return client.auth.signInWithPassword(credentials);
}

export function signUpWithPassword(
  client: SupabaseClient,
  params: { email: string; password: string; emailRedirectTo?: string },
) {
  return client.auth.signUp({
    email: params.email,
    password: params.password,
    options: { emailRedirectTo: params.emailRedirectTo },
  });
}

export function sendMagicLink(
  client: SupabaseClient,
  params: { email: string; emailRedirectTo?: string },
) {
  return client.auth.signInWithOtp({
    email: params.email,
    options: { emailRedirectTo: params.emailRedirectTo },
  });
}

export function signInWithOAuth(
  client: SupabaseClient,
  params: { provider: Provider; redirectTo?: string },
) {
  return client.auth.signInWithOAuth({
    provider: params.provider,
    options: { redirectTo: params.redirectTo },
  });
}

export function requestPasswordReset(
  client: SupabaseClient,
  params: { email: string; redirectTo?: string },
) {
  return client.auth.resetPasswordForEmail(params.email, {
    redirectTo: params.redirectTo,
  });
}

export function updatePassword(
  client: SupabaseClient,
  params: { password: string },
) {
  return client.auth.updateUser({ password: params.password });
}

export async function verifyTotpChallenge(
  client: SupabaseClient,
  params: { factorId: string; code: string },
) {
  const challenge = await client.auth.mfa.challenge({
    factorId: params.factorId,
  });

  if (challenge.error) {
    return challenge;
  }

  return client.auth.mfa.verify({
    factorId: params.factorId,
    challengeId: challenge.data.id,
    code: params.code,
  });
}

export function challengeAndVerifyTotp(
  client: SupabaseClient,
  params: { factorId: string; code: string },
) {
  return client.auth.mfa.challengeAndVerify({
    factorId: params.factorId,
    code: params.code,
  });
}

export function consumeRecoveryCode(client: SupabaseClient, code: string) {
  return client.rpc('consume_mfa_recovery_code', { p_code: code });
}
