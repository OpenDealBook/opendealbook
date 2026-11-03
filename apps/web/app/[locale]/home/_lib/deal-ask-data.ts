import { z } from 'zod';

import { dealAiScope } from '@odb/ai/scope';
import { dealDisplayName } from '@odb/deals/shared';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { resolveScopedTeamAi, teamAiScope } from '@odb/workflows/team-ai';

const cited = z.object({
  documentId: z.string(),
  documentName: z.string(),
  version: z.number(),
});

const citations = z.array(
  z.union([
    cited.extend({ pageFrom: z.number(), pageTo: z.number() }),
    cited.extend({ sheet: z.string(), cellRange: z.string() }),
  ]),
);

const threadSummary = z
  .object({
    id: z.string(),
    deal_id: z.string(),
    deal_name: z.string(),
    first_question: z.string(),
    last_asked_at: z.string(),
  })
  .transform((row) => ({
    id: row.id,
    dealId: row.deal_id,
    dealName: row.deal_name,
    question: row.first_question,
    lastAskedAt: row.last_asked_at,
  }));

export type AiThreadSummary = z.output<typeof threadSummary>;
export const aiThreadCursor = z.object({
  id: z.uuid(),
  lastAskedAt: z.iso.datetime({ offset: true }),
});

export type AiThreadCursor = z.infer<typeof aiThreadCursor>;

const THREAD_PAGE = 50;

export async function loadDealAsk(dealId: string, teamId: string) {
  if (!z.uuid().safeParse(dealId).success) {
    return null;
  }
  const client = getSupabaseServerClient();
  const scope = await dealAiScope(client, dealId, 'deals.work');

  if (typeof scope === 'string' || scope.accountId !== teamId) {
    return null;
  }

  const [
    { data: questions },
    { data: documents },
    { data: people },
    { data: locked },
    { data: canManage },
    ai,
  ] = await Promise.all([
    client
      .from('deal_ai_question')
      .select(
        'id, thread_id, asked_by, question, answer, status, citations, created_at, finished_at',
      )
      .eq('deal_id', dealId)
      .order('created_at')
      .throwOnError(),
    client
      .from('dr_document')
      .select('id, version')
      .eq('deal_id', dealId)
      .throwOnError(),
    client.rpc('deal_people', { deal_id: dealId }).throwOnError(),
    client
      .rpc('is_account_locked', { target_account_id: teamId })
      .throwOnError(),
    client
      .rpc('manages_deal_in_account', { deal_id: dealId, account_id: teamId })
      .throwOnError(),
    resolveScopedTeamAi(scope, 'chat'),
  ]);

  return {
    people: Object.fromEntries(
      people.map((person) => [person.user_id, person.name]),
    ),
    questions: questions.map((question) => ({
      ...question,
      citations: citations.parse(question.citations),
    })),
    readable: Object.fromEntries(
      documents.map((document) => [document.id, document.version]),
    ),
    connected: ai !== null,
    readOnly: locked,
    canManage,
  };
}

export async function listAiThreads(
  teamId: string,
  after?: AiThreadCursor,
): Promise<{ threads: AiThreadSummary[]; next: AiThreadCursor | null }> {
  const cursor = after && aiThreadCursor.parse(after);
  const summaries = getSupabaseServerClient()
    .from('deal_ai_thread_summary')
    .select('id, deal_id, deal_name, first_question, last_asked_at')
    .eq('account_id', teamId);
  const { data } = await (
    cursor
      ? summaries.or(
          `last_asked_at.lt."${cursor.lastAskedAt}",and(last_asked_at.eq."${cursor.lastAskedAt}",id.lt.${cursor.id})`,
        )
      : summaries
  )
    .order('last_asked_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(THREAD_PAGE + 1)
    .throwOnError();
  const threads = z.array(threadSummary).parse(data);
  const page = threads.slice(0, THREAD_PAGE);

  return {
    threads: page,
    next:
      threads.length > THREAD_PAGE
        ? { id: page.at(-1)!.id, lastAskedAt: page.at(-1)!.lastAskedAt }
        : null,
  };
}

export async function aiThreadDeal(threadId: string, teamId: string) {
  if (!z.uuid().safeParse(threadId).success) {
    return null;
  }
  const { data: thread } = await getSupabaseServerClient()
    .from('deal_ai_thread')
    .select('deal_id, deal!inner(account_id)')
    .eq('id', threadId)
    .eq('deal.account_id', teamId)
    .maybeSingle()
    .throwOnError();
  return thread?.deal_id ?? null;
}

export async function dealName(dealId: string) {
  const { data: deal } = await getSupabaseServerClient()
    .from('deal')
    .select('firm!inner(name)')
    .eq('id', dealId)
    .single()
    .throwOnError();
  return dealDisplayName(deal);
}

export async function listAskableDeals(teamId: string) {
  const { data: deals } = await getSupabaseServerClient()
    .from('deal')
    .select('id, firm!inner(name)')
    .eq('account_id', teamId)
    .is('archived_at', null)
    .is('resolution', null)
    .throwOnError();

  return deals
    .map((deal) => ({ id: deal.id, name: dealDisplayName(deal) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function teamAiConnected(userId: string, teamId: string) {
  const scope = await teamAiScope(getSupabaseServerClient(), userId, teamId);
  return scope !== null && (await resolveScopedTeamAi(scope, 'chat')) !== null;
}
