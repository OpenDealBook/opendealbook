import { getSupabaseServerAdminClient } from '@odb/supabase/server';

export async function POST(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get('token');
  if (token === null) {
    return new Response(null, { status: 400 });
  }

  await getSupabaseServerAdminClient()
    .rpc('unsubscribe_outreach', { p_token: token })
    .throwOnError();

  return new Response(null, { status: 200 });
}
