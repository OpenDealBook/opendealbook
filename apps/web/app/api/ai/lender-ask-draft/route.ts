import type { DocumentCitation } from '@odb/ai/citations';
import { dealAiScope } from '@odb/ai/scope';
import {
  answerWithDocuments,
  type FinishOutcome,
  type LenderAskDraft,
  lenderAskDraft,
} from '@odb/ai/server';
import { i18nConfig } from '@odb/i18n/config';
import { loadFolderTree } from '@odb/lender-rooms/asks/room-checks.ts';
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
import type { LenderAskDraftRefusal, LenderAskDraftStreamError } from './codes';

export const runtime = 'nodejs';
export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DONE_COLUMNS =
  'id, ask_id, requested_by, status, body, citations, suggested_document_ids, not_found, failure_reason, credits_used, created_at, finished_at';
const NOT_SAVED = 'The draft could not be saved';

const START_REFUSALS = [
  {
    sqlState: '23505',
    marker: 'ux_lender_ask_ai_draft_one_running',
    error: 'A draft of this ask is already running',
    code: 'already_running',
  },
  {
    sqlState: '23514',
    marker: 'a form ask gets no draft',
    error: 'A form gets no AI draft',
    code: 'form_ask',
  },
  {
    sqlState: 'ODB04',
    marker: 'only an open or answered ask gets a draft',
    error: 'This ask is closed',
    code: 'ask_closed',
  },
] as const;

function refuse(status: number, error: string, code: LenderAskDraftRefusal) {
  return Response.json({ error, code }, { status });
}

function askNotFound() {
  return refuse(404, 'Ask not found', 'ask_not_found');
}

function finishedColumns(
  outcome: FinishOutcome<LenderAskDraft>,
  suggested: string[],
) {
  return outcome.status === 'finished'
    ? {
        status: 'ready' as const,
        body: outcome.value.body,
        citations: outcome.value.citations as unknown as Json,
        suggested_document_ids: suggested,
        not_found: outcome.value.notFound,
      }
    : unfinishedColumns(outcome);
}

function streamError(error: string, code: LenderAskDraftStreamError) {
  return { error, code };
}

export async function POST(request: Request) {
  const client = getSupabaseServerClient();

  const { data: user } = await requireUser(client);

  if (!user) {
    return refuse(401, 'Authentication required', 'unauthenticated');
  }

  const body = (await request.json()) as {
    askId?: unknown;
    locale?: unknown;
  };

  if (typeof body.askId !== 'string') {
    return refuse(400, 'askId is required', 'invalid_request');
  }

  const locale = i18nConfig.locales.find((known) => known === body.locale);

  if (!locale) {
    return refuse(400, 'Unknown locale', 'unknown_locale');
  }

  const askId = body.askId;
  const { data: ask } = UUID.test(askId)
    ? await client
        .from('lender_ask')
        .select(
          'room_id, title, body, lender_room!inner(deal_id, private_folder_id)',
        )
        .eq('id', askId)
        .maybeSingle()
        .throwOnError()
    : { data: null };

  if (!ask) {
    return askNotFound();
  }

  const scope = await dealAiScope(
    client,
    ask.lender_room.deal_id,
    'deals.work',
  );

  if (scope === 'not_found' || scope === 'forbidden') {
    return askNotFound();
  }

  const { data: locked } = await client
    .rpc('is_account_locked', { target_account_id: scope.accountId })
    .throwOnError();

  if (locked) {
    return refuse(403, TEAM_READ_ONLY, 'team_read_only');
  }

  const { data: messages } = await client
    .from('lender_ask_message')
    .select('side, body')
    .eq('ask_id', askId)
    .order('created_at')
    .order('id')
    .throwOnError();
  const { data: routes } = await client
    .from('seller_room_question_route')
    .select('question_id')
    .eq('lender_ask_id', askId)
    .throwOnError();
  const { data: sellerAnswers } = await client
    .from('seller_room_question_message')
    .select('body')
    .in(
      'question_id',
      routes.map((route) => route.question_id),
    )
    .eq('side', 'seller')
    .order('created_at')
    .order('id')
    .throwOnError();
  const { data: files } = await client
    .from('lender_ask_file')
    .select('dr_document_id')
    .eq('ask_id', askId)
    .eq('role', 'attachment')
    .order('created_at')
    .order('id')
    .throwOnError();
  const attachedIds = [...new Set(files.map((file) => file.dr_document_id))];
  const shownIds = (
    await Promise.all(
      attachedIds.map(async (documentId) => {
        const { data: shown } = await client
          .rpc('lender_room_shows_document', {
            room_id: ask.room_id,
            document_id: documentId,
          })
          .throwOnError();
        return shown ? [documentId] : [];
      }),
    )
  ).flat();
  const { data: documents } = await client
    .from('dr_document')
    .select('id, name, version, created_at')
    .in('id', shownIds)
    .throwOnError();
  const readable = await readableAttachments(
    client,
    shownIds.map(
      (documentId) => documents.find(({ id }) => id === documentId)!,
    ),
  );

  if (readable === 'processing') {
    return refuse(409, ATTACHMENTS_PROCESSING, 'attachments_processing');
  }

  const ai = await resolveScopedTeamAi(scope, 'chat');

  if (!ai) {
    return refuse(409, CONNECT_AI_PROVIDER, 'connect_ai_provider');
  }

  const { data: draftId, error } = await client.rpc(
    'start_lender_ask_ai_draft',
    { p_ask_id: askId },
  );

  if (error) {
    const refusal = startRefusal(error, START_REFUSALS);
    return refuse(409, refusal.error, refusal.code);
  }

  const { mode, request: draftRequest } = lenderAskDraft({
    roomId: ask.room_id,
    locale,
    ask: {
      title: ask.title,
      body: ask.body,
      messages: messages.map((message) => ({
        side:
          message.side === 'lender' ? ('lender' as const) : ('team' as const),
        text: message.body,
      })),
      sellerAnswers: sellerAnswers.map((answer) => answer.body),
      attachments: readable.map((document) => ({
        documentId: document.id,
        name: document.name,
        version: document.version,
      })),
      skippedAttachments: shownIds.length - readable.length,
    },
  });

  const { dealId } = scope;
  const privateFolderId = ask.lender_room.private_folder_id;

  async function attachable(citations: DocumentCitation[]) {
    const ids = [...new Set(citations.map((citation) => citation.documentId))];
    const { data: documents } = await client
      .from('dr_document')
      .select('id, folder_id')
      .in('id', ids)
      .throwOnError();
    const folderTree = await loadFolderTree(dealId);
    return ids.filter((id) =>
      documents.some(
        (document) =>
          document.id === id &&
          folderTree.isWithin(document.folder_id, privateFolderId),
      ),
    );
  }

  return eventStream(
    async (send) => {
      const outcome = await answerWithDocuments(
        ai,
        {
          client,
          dealId,
          askedBy: user.id,
          subject: { kind: 'lender_ask_ai_draft', id: draftId },
          question: draftRequest,
          earlier: [],
        },
        mode,
        (step) => send('progress', progressOf(step)),
      );
      const suggested =
        outcome.status === 'finished'
          ? await attachable(outcome.value.citations).catch(
              (error: unknown) => {
                getLogger().error(
                  { error, draftId },
                  'Suggested files for a lender ask draft could not be worked out',
                );
                return [];
              },
            )
          : [];
      const { data: finished, error: notSaved } =
        await getSupabaseServerAdminClient()
          .from('lender_ask_ai_draft')
          .update(
            withoutNul({
              ...finishedColumns(outcome, suggested),
              steps: outcome.steps as unknown as Json,
              model: outcome.model,
              credits_used: outcome.credits,
              finished_at: new Date().toISOString(),
            }),
          )
          .eq('id', draftId)
          .select(DONE_COLUMNS)
          .single();
      if (notSaved) {
        getLogger().error(
          { error: notSaved, draftId },
          'Lender ask draft could not be saved',
        );
        send('error', streamError(NOT_SAVED, 'save_failed'));
      } else {
        send('done', finished);
      }
    },
    async () => {
      await getSupabaseServerAdminClient()
        .from('lender_ask_ai_draft')
        .update({
          status: 'failed',
          failure_reason: 'failed',
          finished_at: new Date().toISOString(),
        })
        .eq('id', draftId)
        .throwOnError();
    },
    { draftId },
  );
}
