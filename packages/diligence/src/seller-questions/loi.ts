import type { getSupabaseServerClient } from '@odb/supabase/server';

type ServerClient = ReturnType<typeof getSupabaseServerClient>;

export async function isLoiSigned(
  client: ServerClient,
  dealId: string,
): Promise<boolean> {
  const { data } = await client
    .rpc('deal_loi_signed', { deal_id: dealId })
    .throwOnError();

  return data;
}
