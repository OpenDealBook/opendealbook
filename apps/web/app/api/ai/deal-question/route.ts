import { dealAiScope } from '@odb/ai/scope';
import {
  answerWithDocuments,
  dealQuestionMode,
  type QuestionOutcome,
} from '@odb/ai/server';
import { dealDisplayName } from '@odb/deals/shared';
import { i18nConfig } from '@odb/i18n/config';
import { TEAM_READ_ONLY } from '@odb/next';
import { getLogger } from '@odb/shared/logger';
import type { Json } from '@odb/supabase';
import {
  getSupabaseServerAdminClient,
  getSupabaseServerClient,
  requireUser,
} from '@odb/supabase/server';
import {
  CONNECT_AI_PROVIDER,
  resolveScopedTeamAi,
} from '@odb/workflows/team-ai';

import { eventStream } from '../_lib/sse';
import type { DealQuestionRefusal } from './codes';
import { progressOf } from './progress';

export const runtime = 'nodejs';
export const maxDuration = 300;

const LONGEST_QUESTION = 4000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DONE_COLUMNS =
  'id, thread_id, question, answer, status, citations, credits_used, created_at, finished_at';
const NOT_SAVED = 'The answer could not be saved';
const ESCAPED_NUL = /(?<=(?:^|[^\\])(?:\\\\)*)\\u0000/g;

const REFUSALS = [
  {
    sqlState: '23505',
    marker: 'ux_deal_ai_question_one_running',
    error: 'A question is already running',
    code: 'already_running',
  },
  {
    sqlState: '23514',
    marker: 'a thread holds at most 20 questions',
    error: 'This thread is full; start a new one',
    code: 'thread_full',
  },
] as const;

function refuse(status: number, error: string, code: DealQuestionRefusal) {
  return Response.json({ error, code }, { status });
}

function withoutNul<T>(value: T): T {
  return JSON.parse(JSON.stringify(value).replace(ESCAPED_NUL, '')) as T;
}

function saved(outcome: QuestionOutcome) {
  return withoutNul({
    status: outcome.status,
    answer:
      outcome.status === 'answered'
        ? outcome.answer
        : outcome.status === 'failed'
          ? outcome.reason
          : null,
    citations: (outcome.status === 'answered'
      ? outcome.citations
      : []) as unknown as Json,
    steps: outcome.steps as unknown as Json,
    model: outcome.model,
    credits_used: outcome.credits,
    finished_at: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const client = getSupabaseServerClient();

  const { data: user } = await requireUser(client);

  if (!user) {
    return refuse(401, 'Authentication required', 'unauthenticated');
  }

  const body = (await request.json()) as {
    dealId?: unknown;
    question?: unknown;
    threadId?: unknown;
    locale?: unknown;
  };

  if (typeof body.dealId !== 'string' || typeof body.question !== 'string') {
    return refuse(400, 'dealId and question are required', 'invalid_request');
  }

  if (body.threadId !== undefined && typeof body.threadId !== 'string') {
    return refuse(400, 'threadId must be a string', 'invalid_request');
  }

  if (body.question.trim() === '') {
    return refuse(400, 'Ask a question', 'empty_question');
  }

  if (body.question.length > LONGEST_QUESTION) {
    return refuse(
      400,
      'A question can be at most 4,000 characters',
      'question_too_long',
    );
  }

  const locale = i18nConfig.locales.find((known) => known === body.locale);

  if (!locale) {
    return refuse(400, 'Unknown locale', 'unknown_locale');
  }

  const asked = body.question;
  const scope = await dealAiScope(client, body.dealId, 'deals.work');

  if (scope === 'not_found') {
    return refuse(404, 'Deal not found', 'deal_not_found');
  }

  if (scope === 'forbidden') {
    return refuse(
      403,
      'Only the deal team can ask about this deal.',
      'not_deal_team',
    );
  }

  const { data: locked } = await client
    .rpc('is_account_locked', { target_account_id: scope.accountId })
    .throwOnError();

  if (locked) {
    return refuse(403, TEAM_READ_ONLY, 'team_read_only');
  }

  if (body.threadId !== undefined) {
    const { data: thread } = UUID.test(body.threadId)
      ? await client
          .from('deal_ai_thread')
          .select('id')
          .eq('id', body.threadId)
          .eq('deal_id', scope.dealId)
          .maybeSingle()
          .throwOnError()
      : { data: null };

    if (!thread) {
      return refuse(404, 'Thread not found', 'thread_not_found');
    }
  }

  const ai = await resolveScopedTeamAi(scope, 'chat');

  if (!ai) {
    return refuse(409, CONNECT_AI_PROVIDER, 'connect_ai_provider');
  }

  const { data: started, error } = await client
    .rpc('start_deal_ai_question', {
      p_deal_id: scope.dealId,
      p_question: asked,
      p_thread_id: body.threadId,
    })
    .single();

  if (error) {
    const refusal = REFUSALS.find(
      ({ sqlState, marker }) =>
        error.code === sqlState && error.message.includes(marker),
    );
    if (!refusal) {
      throw error;
    }
    return refuse(409, refusal.error, refusal.code);
  }

  const { question_id: questionId, thread_id: threadId } = started;

  const [{ data: earlier }, { data: deal }] = await Promise.all([
    client
      .from('deal_ai_question')
      .select('question, answer')
      .eq('thread_id', threadId)
      .eq('status', 'answered')
      .order('created_at')
      .throwOnError(),
    client
      .from('deal')
      .select('firm!inner(name)')
      .eq('id', scope.dealId)
      .single()
      .throwOnError(),
  ]);

  return eventStream(async (send) => {
    const outcome = await answerWithDocuments(
      ai,
      {
        client,
        dealId: scope.dealId,
        askedBy: user.id,
        questionId,
        question: asked,
        earlier: earlier.map((earlierQuestion) => ({
          question: earlierQuestion.question,
          answer: earlierQuestion.answer!,
        })),
      },
      dealQuestionMode({ dealName: dealDisplayName(deal), locale }),
      (step) => send('progress', progressOf(step)),
    );
    const { data: finished, error: notSaved } =
      await getSupabaseServerAdminClient()
        .from('deal_ai_question')
        .update(saved(outcome))
        .eq('id', questionId)
        .select(DONE_COLUMNS)
        .single();
    if (notSaved) {
      getLogger().error(
        { error: notSaved, questionId },
        'Deal AI question could not be saved',
      );
      send('error', { error: NOT_SAVED, code: 'save_failed' });
    } else {
      send('done', finished);
    }
  });
}
