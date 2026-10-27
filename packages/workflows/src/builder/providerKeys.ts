import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

interface ProviderKey {
  apiKey: string;
  provider: string;
  baseUrl: string;
}

export function providerKey(
  accountId: string,
  kind: 'email_lookup',
): Promise<(ProviderKey & { actorId: string }) | null>;
export function providerKey(accountId: string, kind: 'letters'): Promise<ProviderKey | null>;
export async function providerKey(accountId: string, kind: 'email_lookup' | 'letters') {
  const { data } = await getSupabaseServerAdminClient()
    .rpc('provider_key', { p_account_id: accountId, p_kind: kind })
    .maybeSingle()
    .throwOnError();
  if (!data) {
    return null;
  }
  const key = { apiKey: data.api_key, provider: data.provider, baseUrl: data.base_url };
  return kind === 'email_lookup' ? { ...key, actorId: data.actor_id! } : key;
}
