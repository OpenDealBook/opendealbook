import type { getSupabaseServerClient } from '@odb/supabase/server';

type ServerClient = ReturnType<typeof getSupabaseServerClient>;

export async function isLoiSigned(
  client: ServerClient,
  dealId: string,
): Promise<boolean> {
  const { data } = await client
    .from('contract')
    .select('id')
    .eq('deal_id', dealId)
    .eq('type', 'loi')
    .in('status', ['signed', 'executed'])
    .throwOnError();

  return data.length > 0;
}
