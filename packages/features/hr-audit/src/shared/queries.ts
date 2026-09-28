import type { Tables } from '@odb/supabase';
import type { getSupabaseBrowserClient } from '@odb/supabase/client';

type Client = ReturnType<typeof getSupabaseBrowserClient>;

export async function fetchHrAuditEngagement(
  client: Client,
  dealId: string,
): Promise<Tables<'hr_audit_engagement'> | null> {
  const { data, error } = await client
    .from('hr_audit_engagement')
    .select('*')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function fetchEmployees(
  client: Client,
  dealId: string,
): Promise<Tables<'employee'>[]> {
  const { data, error } = await client
    .from('employee')
    .select('*')
    .eq('deal_id', dealId)
    .order('name', { ascending: true });

  if (error) {
    throw error;
  }

  return data;
}
