import { dealAiScope } from '@odb/ai/scope';
import {
  type AnswerCheck,
  answerCheck,
  answerWithDocuments,
  type FinishOutcome,
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

import {
  ATTACHMENTS_PROCESSING,
  readableAttachments,
  startRefusal,
  unfinishedColumns,
  withoutNul,
} from '../_lib/ai-run';
import { eventStream } from '../_lib/sse';
import { progressOf } from '../deal-question/progress';

export const runtime = 'nodejs';
export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DONE_COLUMNS =
  'id, question_id, message_id, status, overall, findings, follow_up, failure_reason, credits_used, created_at, finished_at';
const NOT_SAVED = 'The check could not be saved';
const NOT_LATEST = "Only the seller's latest answer can be checked";

type SellerAnswerCheckRefusal =
  | 'unauthenticated'
  | 'invalid_request'
  | 'unknown_locale'
  | 'message_not_found'
  | 'not_deal_team'
  | 'team_read_only'
  | 'not_latest_answer'
  | 'empty_answer'
  | 'attachments_processing'
  | 'connect_ai_provider'
  | 'already_running';

const START_REFUSALS = [
  {
    sqlState: '23505',
    marker: 'ux_seller_answer_check_one_running',
    error: 'A check of this answer is already running',
    code: 'already_running',
  },
  {
    sqlState: 'ODB03',
    marker: 'only the latest message in a thread is checked',
    error: NOT_LATEST,
    code: 'not_latest_answer',
  },
] as const;

function refuse(status: number, error: string, code: SellerAnswerCheckRefusal) {
  return Response.json({ error, code }, { status });
}

function finishedColumns(outcome: FinishOutcome<AnswerCheck>) {
  return outcome.status === 'finished'
    ? {
        status: 'checked' as const,
        overall: outcome.value.overall,
        findings: outcome.value.findings as unknown as Json,
        follow_up: outcome.value.followUp,
      }
    : unfinishedColumns(outcome);
}

function saved(outcome: FinishOutcome<AnswerCheck>) {
  return withoutNul({
    ...finishedColumns(outcome),
    steps: outcome.steps as unknown as Json,
    model: outcome.model,
    credits_used: outcome.credits,
    finished_at: new Date().toISOString(),
  });
}

function messageNotFound() {
  return refuse(404, 'Message not found', 'message_not_found');
}

export async function POST(request: Request) {
  const client = getSupabaseServerClient();

  const { data: user } = await requireUser(client);

  if (!user) {
    return refuse(401, 'Authentication required', 'unauthenticated');
  }

  const body = (await request.json()) as {
    messageId?: unknown;
    locale?: unknown;
  };

  if (typeof body.messageId !== 'string') {
    return refuse(400, 'messageId is required', 'invalid_request');
  }

  const locale = i18nConfig.locales.find((known) => known === body.locale);

  if (!locale) {
    return refuse(400, 'Unknown locale', 'unknown_locale');
  }

  const messageId = body.messageId;
  const { data: answer } = UUID.test(messageId)
    ? await client
        .from('seller_room_question_message')
        .select(
          'question_id, seller_room_question!inner(title, body, seller_room!inner(deal_id))',
        )
        .eq('id', messageId)
        .maybeSingle()
        .throwOnError()
    : { data: null };

  if (!answer) {
    return messageNotFound();
  }

  const scope = await dealAiScope(
    client,
    answer.seller_room_question.seller_room.deal_id,
    'deals.work',
  );

  if (scope === 'not_found') {
    return messageNotFound();
  }

  if (scope === 'forbidden') {
    return refuse(
      403,
      'Only the deal team can check seller answers.',
      'not_deal_team',
    );
  }

  const { data: locked } = await client
    .rpc('is_account_locked', { target_account_id: scope.accountId })
    .throwOnError();

  if (locked) {
    return refuse(403, TEAM_READ_ONLY, 'team_read_only');
  }

  const { data: messages } = await client
    .from('seller_room_question_message')
    .select('id, side, body')
    .eq('question_id', answer.question_id)
    .order('created_at')
    .order('id')
    .throwOnError();
  const latest = messages.at(-1)!;

  if (latest.id !== messageId || latest.side !== 'seller') {
    return refuse(409, NOT_LATEST, 'not_latest_answer');
  }

  if (latest.body.trim() === '') {
    return refuse(409, 'The answer has no text to check', 'empty_answer');
  }

  const { data: files } = await client
    .from('seller_room_question_file')
    .select('dr_document_id')
    .eq('question_id', answer.question_id)
    .eq('side', 'seller')
    .throwOnError();
  const attachedIds = [...new Set(files.map((file) => file.dr_document_id))];
  const { data: documents } = await client
    .from('dr_document')
    .select('id, name, version, created_at')
    .in('id', attachedIds)
    .is('removed_at', null)
    .throwOnError();
  const readable = await readableAttachments(client, documents);

  if (readable === 'processing') {
    return refuse(409, ATTACHMENTS_PROCESSING, 'attachments_processing');
  }

  const ai = await resolveScopedTeamAi(scope, 'chat');

  if (!ai) {
    return refuse(409, CONNECT_AI_PROVIDER, 'connect_ai_provider');
  }

  const { data: checkId, error } = await client.rpc(
    'start_seller_answer_check',
    { p_message_id: messageId },
  );

  if (error) {
    const refusal = startRefusal(error, START_REFUSALS);
    return refuse(409, refusal.error, refusal.code);
  }

  const { data: deal } = await client
    .from('deal')
    .select('firm!inner(name)')
    .eq('id', scope.dealId)
    .single()
    .throwOnError();
  const question = answer.seller_room_question;
  const { mode, request: checkRequest } = answerCheck({
    dealName: dealDisplayName(deal),
    locale,
    thread: [
      {
        side: 'buyer',
        text: question.body
          ? `${question.title}\n\n${question.body}`
          : question.title,
      },
      ...messages.map((message) => ({
        side:
          message.side === 'seller' ? ('seller' as const) : ('buyer' as const),
        text: message.body,
      })),
    ],
    attachments: readable.map((document) => ({
      documentId: document.id,
      name: document.name,
      version: document.version,
    })),
    skippedAttachments: attachedIds.length - readable.length,
  });

  return eventStream(
    async (send) => {
      const outcome = await answerWithDocuments(
        ai,
        {
          client,
          dealId: scope.dealId,
          askedBy: user.id,
          subject: { kind: 'seller_answer_check', id: checkId },
          question: checkRequest,
          earlier: [],
        },
        mode,
        (step) => send('progress', progressOf(step)),
      );
      const { data: finished, error: notSaved } =
        await getSupabaseServerAdminClient()
          .from('seller_answer_check')
          .update(saved(outcome))
          .eq('id', checkId)
          .select(DONE_COLUMNS)
          .single();
      if (notSaved) {
        getLogger().error(
          { error: notSaved, checkId },
          'Seller answer check could not be saved',
        );
        send('error', { error: NOT_SAVED, code: 'save_failed' });
      } else {
        send('done', finished);
      }
    },
    async () => {
      await getSupabaseServerAdminClient()
        .from('seller_answer_check')
        .update({
          status: 'failed',
          failure_reason: 'failed',
          finished_at: new Date().toISOString(),
        })
        .eq('id', checkId)
        .throwOnError();
    },
    { checkId },
  );
}
