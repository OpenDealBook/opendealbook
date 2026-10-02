import type { getSupabaseServerClient } from '@odb/supabase/server';

type ServerClient = ReturnType<typeof getSupabaseServerClient>;

export async function isLoiSigned(
  client: ServerClient,
  dealId: string,
): Promise<boolean> {
  const { data } = await client
    .from('contract')
    .select('id, contract_version!inner(is_signed)')
    .eq('deal_id', dealId)
    .eq('type', 'loi')
    .eq('contract_version.is_signed', true)
    .throwOnError();

  return data.length > 0;
}
