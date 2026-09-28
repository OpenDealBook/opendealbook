import type { getSupabaseServerClient } from '@odb/supabase/server';

type ServerClient = ReturnType<typeof getSupabaseServerClient>;

export async function listSellerQuestions(
  client: ServerClient,
  dealId: string,
) {
  const { data } = await client
    .from('seller_question')
    .select('*')
    .eq('deal_id', dealId)
    .throwOnError();

  return data;
}
