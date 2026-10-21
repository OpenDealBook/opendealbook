import { answerDealQuestion } from '@odb/ai/server';
import { TEAM_READ_ONLY } from '@odb/next';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient, requireUser } from '@odb/supabase/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const client = getSupabaseServerClient();

  const { data: user } = await requireUser(client);

  if (!user) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }

  const body = (await request.json()) as {
    dealId?: unknown;
    question?: unknown;
  };

  if (typeof body.dealId !== 'string' || typeof body.question !== 'string') {
    return Response.json(
      { error: 'dealId and question are required' },
      { status: 400 },
    );
  }

  const { data: deal } = await client
    .from('deal')
    .select('account_id')
    .eq('id', body.dealId)
    .maybeSingle()
    .throwOnError();

  const { data: locked } = deal
    ? await client
        .rpc('is_account_locked', { target_account_id: deal.account_id })
        .throwOnError()
    : { data: false };

  if (locked) {
    return Response.json(
      { error: TEAM_READ_ONLY },
      { status: 403 },
    );
  }

  const result = await answerDealQuestion(
    client,
    { dealId: body.dealId, question: body.question },
    getSupabaseServerAdminClient(),
  );

  return Response.json(result);
}
