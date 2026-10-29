import { dealAiScope } from '@odb/ai/scope';
import { answerDealQuestion } from '@odb/ai/server';
import { TEAM_READ_ONLY } from '@odb/next';
import { getSupabaseServerClient, requireUser } from '@odb/supabase/server';
import { CapReached, TeamAiNotConnected } from '@odb/workflows/team-ai';

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

  const scope = await dealAiScope(client, body.dealId, 'deals.work');

  if (scope === 'not_found') {
    return Response.json({ error: 'Deal not found' }, { status: 404 });
  }

  if (scope === 'forbidden') {
    return Response.json({ error: 'Only the deal team can ask about this deal.' }, { status: 403 });
  }

  const { data: locked } = await client
    .rpc('is_account_locked', { target_account_id: scope.accountId })
    .throwOnError();

  if (locked) {
    return Response.json(
      { error: TEAM_READ_ONLY },
      { status: 403 },
    );
  }

  try {
    return Response.json(
      await answerDealQuestion(client, scope, { question: body.question }),
    );
  } catch (error) {
    if (error instanceof CapReached) {
      return Response.json({ error: error.message }, { status: 429 });
    }
    if (error instanceof TeamAiNotConnected) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
