import type { Tables } from '@tuckin/supabase';
import type { getSupabaseBrowserClient } from '@tuckin/supabase/client';

type Client = ReturnType<typeof getSupabaseBrowserClient>;

export async function fetchClientTransitions(
  client: Client,
  dealId: string,
): Promise<Tables<'client_transition'>[]> {
  const { data, error } = await client
    .from('client_transition')
    .select('*')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  return data;
}
