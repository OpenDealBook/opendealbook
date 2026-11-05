import type { SupabaseClient } from '@supabase/supabase-js';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '@odb/supabase';
import { dealAiScope, resolveScopedTeamAi } from '@odb/workflows/team-ai';

import {
  fakeAiProvider,
  type ReceivedAiCall,
} from '../../workflows/test-support/fake-ai-provider';
import {
  appendDealEvent,
  provisionAccount,
  seedDeal,
  type IntegrationAccount,
} from '../../workflows/test-support/integration-harness';
import {
  type AnswerMode,
  answerWithDocuments,
  type DealQuestion,
  dealQuestionMode,
} from './agent';

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const TEAM_INPUT = 2;
const TEAM_OUTPUT = 4;
const STEP_CREDITS = (12 * TEAM_INPUT + 5 * TEAM_OUTPUT) / 1e4;

let team: IntegrationAccount;
let dealId: string;
let questionId: string;
let provider: Awaited<ReturnType<typeof fakeAiProvider>>;
let script: (call: ReceivedAiCall, index: number) => unknown;
let gateway: Server;
let held: { arrived: () => void; released: Promise<void> } | null = null;

async function startGateway(): Promise<string> {
  gateway = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) {
      body += chunk;
    }
    const hold = held;
    held = null;
    hold?.arrived();
    await hold?.released;
    const forwarded = await fetch(
      `${new URL(provider.baseUrl).origin}${request.url}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      },
    );
    response.writeHead(forwarded.status, {
      'content-type': 'application/json',
    });
    response.end(await forwarded.text());
  });
  await new Promise<void>((resolve) => gateway.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(gateway.address() as AddressInfo).port}/v1`;
}

function holdNextReply() {
  const arrived = Promise.withResolvers<void>();
  const released = Promise.withResolvers<void>();
  held = { arrived: arrived.resolve, released: released.promise };
  return { arrived: arrived.promise, release: released.resolve };
}

async function setLocked(locked: boolean) {
  await team.admin
    .from('accounts')
    .update({
      trial_ends_at: new Date(
        Date.now() + (locked ? -86_400_000 : 86_400_000),
      ).toISOString(),
    })
    .eq('id', team.accountId)
    .throwOnError();
}

const cim = crypto.randomUUID();
const report = crypto.randomUUID();
const model = crypto.randomUUID();
const longPassage = Array.from(
  { length: 80 },
  (_, index) => `Lease clause ${index} renews yearly.`,
).join('\n');

type SentMessage = {
  role: string;
  content: string | null;
  tool_calls?: unknown[];
  tool_call_id?: string;
};

function sent(index: number) {
  return provider.received[index]!.body as unknown as {
    tool_choice?: string;
    tools: { function: { name: string } }[];
    messages: SentMessage[];
  };
}

const usage = { prompt_tokens: 12, completion_tokens: 5 };

function toolTurn(...calls: [string, unknown][]) {
  return {
    choices: [
      {
        finish_reason: 'tool_calls',
        message: {
          content: null,
          tool_calls: calls.map(([name, input], index) => ({
            id: `call-${index}`,
            type: 'function',
            function: { name, arguments: JSON.stringify(input) },
          })),
        },
      },
    ],
    usage,
  };
}

function textTurn(text: string, finishReason = 'stop') {
  return {
    choices: [{ finish_reason: finishReason, message: { content: text } }],
    usage,
  };
}

function scripted(...turns: unknown[]) {
  script = (_call, index) => turns[index];
}

async function setCreditCap(credits: number) {
  await team.admin
    .from('outreach_setting')
    .update({ ai_monthly_credit_cap: credits })
    .eq('account_id', team.accountId)
    .throwOnError();
}

beforeAll(async () => {
  team = await provisionAccount();
  provider = await fakeAiProvider({
    status: 200,
    body: null,
    answer: (call) => script(call, provider.received.length - 1),
  });
  const gatewayUrl = await startGateway();
  await team.user
    .rpc('save_llm_endpoint', {
      p_account_id: team.accountId,
      p_provider: 'openai_compatible',
      p_model: 'team-chat',
      p_base_url: gatewayUrl,
      p_api_key: 'sk-vault',
      p_embedding_model: 'team-embed',
      p_input_price_per_mtok: TEAM_INPUT,
      p_cached_input_price_per_mtok: 1,
      p_output_price_per_mtok: TEAM_OUTPUT,
    })
    .throwOnError();
  await team.admin
    .from('outreach_setting')
    .insert({
      account_id: team.accountId,
      daily_cap: 10,
      ai_monthly_credit_cap: 10000,
    })
    .throwOnError();
  dealId = await seedDeal(team.admin, team.accountId, team.userId, {
    description: 'Acme Plumbing',
  });
  const { data: folder } = await team.admin
    .from('dr_folder')
    .insert({ account_id: team.accountId, deal_id: dealId, name: 'Diligence' })
    .select('id')
    .single()
    .throwOnError();
  for (const [id, name] of [
    [cim, 'cim.pdf'],
    [report, 'report.pdf'],
    [model, 'model.xlsx'],
  ] as const) {
    await appendDealEvent(team.admin, {
      dealId,
      aggregateType: 'dr_document',
      aggregateId: id,
      eventType: 'dr_document.added',
      payload: {
        folder_id: folder.id,
        name,
        storage_path: `deal/${dealId}/${id}`,
        version: 1,
      },
    });
  }
  const page = (documentId: string, index: number, text: string) => ({
    account_id: team.accountId,
    deal_id: dealId,
    dr_document_id: documentId,
    document_version: 1,
    segment_index: index,
    kind: 'page' as const,
    page_from: index + 1,
    page_to: index + 1,
    text,
    from_ocr: false,
    content_hash: `${documentId}-${index}`,
  });
  await team.admin
    .from('document_segment')
    .insert([
      page(cim, 0, 'Revenue was 1.4 million with an EBITDA addback.'),
      page(report, 0, 'a'.repeat(20000)),
      page(report, 1, 'b'.repeat(20000)),
      page(report, 2, 'c'.repeat(20000)),
      {
        ...page(cim, 1, 'Customer list, see Schedule 4.13.'),
        page_from: 4,
        page_to: 5,
      },
      { ...page(cim, 2, longPassage), page_from: 8, page_to: 9 },
      {
        account_id: team.accountId,
        deal_id: dealId,
        dr_document_id: model,
        document_version: 1,
        segment_index: 0,
        kind: 'sheet_block' as const,
        sheet: 'P&L',
        cell_range: 'A1:C9',
        text: 'P&L rows 1 to 9',
        from_ocr: false,
        content_hash: `${model}-0`,
      },
    ])
    .throwOnError();
  const { data: thread } = await team.user
    .from('deal_ai_thread')
    .insert({ deal_id: dealId })
    .select('id')
    .single()
    .throwOnError();
  const { data: question } = await team.user
    .from('deal_ai_question')
    .insert({
      thread_id: thread.id,
      deal_id: dealId,
      question: 'What was revenue?',
    })
    .select('id')
    .single()
    .throwOnError();
  questionId = question.id;
  process.env.ODB_ALLOW_PRIVATE_AI_URL = '1';
  process.env.ODB_STACK = 'local';
});

beforeEach(() => {
  provider.received.length = 0;
  provider.reply.status = 200;
});

afterAll(async () => {
  provider.close();
  gateway.close();
  delete process.env.ODB_ALLOW_PRIVATE_AI_URL;
  delete process.env.ODB_STACK;
  await team.admin.from('accounts').delete().eq('id', team.accountId);
  await team.cleanup();
});

async function ask(
  question: Partial<DealQuestion> = {},
  progress: unknown[] = [],
  mode?: AnswerMode,
) {
  const client = team.user as SupabaseClient<Database>;
  const scope = await dealAiScope(client, dealId, 'deals.work');
  if (typeof scope === 'string') {
    throw new Error(scope);
  }
  const ai = (await resolveScopedTeamAi(scope, 'chat'))!;
  return answerWithDocuments(
    ai,
    {
      client,
      dealId,
      askedBy: team.userId,
      questionId,
      question: 'What was revenue?',
      earlier: [],
      ...question,
    },
    mode ?? dealQuestionMode({ dealName: 'Acme Plumbing', locale: 'de' }),
    (step) => progress.push(step),
  );
}

const cimPage1 = {
  documentId: cim,
  documentName: 'cim.pdf',
  version: 1,
  pageFrom: 1,
  pageTo: 1,
};

describe('answerWithDocuments (integration)', () => {
  it('reads the documents, answers with the citations it read, and totals the credits of every step', async () => {
    scripted(
      toolTurn(['search_documents', { query: 'revenue' }]),
      textTurn('Revenue was 1.4 million [cim.pdf v1, p. 1].'),
    );
    const progress: unknown[] = [];

    const outcome = await ask({}, progress);

    expect(outcome).toEqual({
      status: 'answered',
      answer: 'Revenue was 1.4 million [cim.pdf v1, p. 1].',
      citations: [
        {
          ...cimPage1,
          excerpt: 'Revenue was 1.4 million with an EBITDA addback.',
        },
      ],
      model: 'team-chat',
      credits: 2 * STEP_CREDITS,
      steps: [
        {
          tool: 'search_documents',
          input: { query: 'revenue' },
          isError: false,
        },
      ],
    });
    expect(progress).toEqual([
      { tool: 'search_documents', input: { query: 'revenue' } },
    ]);
    const system = sent(0).messages[0]!;
    expect(system.role).toBe('system');
    expect(system.content).toContain('Acme Plumbing');
    expect(system.content).toContain('German');
    expect(sent(1).messages.at(-1)).toMatchObject({
      role: 'tool',
      tool_call_id: 'call-0',
      content: expect.stringContaining('[cim.pdf v1, p. 1]'),
    });
  });

  it('drops a citation no tool returned during this question', async () => {
    scripted(
      toolTurn(['search_documents', { query: 'revenue' }]),
      textTurn(
        'Revenue was 1.4 million [cim.pdf v1, p. 1] and margin was 9% [cim.pdf v1, p. 7].',
      ),
    );

    const outcome = await ask();

    expect(outcome).toMatchObject({
      status: 'answered',
      answer: 'Revenue was 1.4 million [cim.pdf v1, p. 1] and margin was 9%.',
      citations: [cimPage1],
    });
  });

  it('after eight tool rounds makes one last call without tools so the model answers from what it read', async () => {
    script = (call) =>
      (call.body as { tool_choice?: string }).tool_choice === 'none'
        ? textTurn('From what I read, no revenue figure.')
        : toolTurn(['list_documents', {}]);

    const outcome = await ask();

    expect(
      provider.received.map((_, index) => sent(index).tool_choice),
    ).toEqual([...Array(8).fill(undefined), 'none']);
    expect(outcome).toMatchObject({
      status: 'answered',
      answer: 'From what I read, no revenue figure.',
      credits: 9 * STEP_CREDITS,
    });
    expect(outcome.steps).toHaveLength(8);
  });

  it('stops with the steps so far when credits run out mid question', async () => {
    const { data: used } = await team.admin
      .rpc('ai_credits_used_this_month', { p_account_id: team.accountId })
      .throwOnError();
    await setCreditCap(Math.ceil(used as number) + 2);
    scripted(
      toolTurn([
        'read_document_pages',
        { document_id: report, from_page: 1, to_page: 3 },
      ]),
      textTurn('never reached'),
    );

    const outcome = await ask().finally(() => setCreditCap(10000));

    expect(outcome).toEqual({
      status: 'credits_ran_out',
      model: 'team-chat',
      credits: STEP_CREDITS,
      steps: [
        {
          tool: 'read_document_pages',
          input: { document_id: report, from_page: 1, to_page: 3 },
          isError: false,
        },
      ],
    });
    expect(provider.received).toHaveLength(1);
  });

  it('fails with the short reason on a reply it cannot read, without retrying', async () => {
    scripted({ nonsense: true });

    const outcome = await ask();

    expect(outcome).toEqual({
      status: 'failed',
      reason: 'The AI provider answered with a reply this call cannot read',
      model: 'team-chat',
      credits: 0,
      steps: [],
    });
    expect(provider.received).toHaveLength(1);
  });

  it('shows a follow-up the earlier questions and answers of its thread', async () => {
    scripted(textTurn('It grew.'));

    await ask({
      question: 'And growth?',
      earlier: [{ question: 'What was revenue?', answer: '1.4 million.' }],
    });

    expect(
      sent(0)
        .messages.slice(1)
        .map(({ role, content }) => ({ role, content })),
    ).toEqual([
      { role: 'user', content: 'What was revenue?' },
      { role: 'assistant', content: '1.4 million.' },
      { role: 'user', content: 'And growth?' },
    ]);
  });

  it('feeds a tool error back to the model and records the errored step', async () => {
    scripted(
      toolTurn(['read_document_pages', { document_id: 'nope', from_page: 1 }]),
      textTurn('I could not read it.'),
    );

    const outcome = await ask();

    expect(sent(1).messages.at(-1)).toEqual({
      role: 'tool',
      tool_call_id: 'call-0',
      content: 'Argument "document_id" must be a document id.',
    });
    expect(outcome).toMatchObject({
      status: 'answered',
      answer: 'I could not read it.',
      steps: [
        {
          tool: 'read_document_pages',
          input: { document_id: 'nope', from_page: 1 },
          isError: true,
        },
      ],
    });
  });

  it('keeps a cited page range inside one a tool read, recorded as the cited range, and drops one outside it', async () => {
    scripted(
      toolTurn([
        'read_document_pages',
        { document_id: cim, from_page: 4, to_page: 5 },
      ]),
      textTurn('Customers [cim.pdf v1, p. 4] and more [cim.pdf v1, p. 6].'),
    );

    const outcome = await ask();

    expect(outcome).toMatchObject({
      status: 'answered',
      answer: 'Customers [cim.pdf v1, p. 4] and more.',
      citations: [{ ...cimPage1, pageFrom: 4, pageTo: 4 }],
    });
  });

  it('keeps up to 300 characters from the start of the passage that holds a cited range, ending on a whole word and an ellipsis', async () => {
    scripted(
      toolTurn([
        'read_document_pages',
        { document_id: cim, from_page: 8, to_page: 9 },
      ]),
      textTurn('Leases renew [cim.pdf v1, p. 9].'),
    );

    const outcome = await ask();

    expect(outcome.status).toBe('answered');
    const [citation] = (outcome as { citations: { excerpt?: string }[] })
      .citations;
    const excerpt = citation!.excerpt!;
    const flattened = longPassage.replaceAll('\n', ' ');
    const kept = excerpt.slice(0, -1);
    expect(excerpt.length).toBeLessThanOrEqual(300);
    expect(excerpt.length).toBeGreaterThan(270);
    expect(excerpt.at(-1)).toBe('\u2026');
    expect(flattened.startsWith(kept)).toBe(true);
    expect(flattened[kept.length]).toBe(' ');
  });

  it('keeps a cited cell or cell range inside a sheet range a tool read, and drops one outside it or on another sheet', async () => {
    scripted(
      toolTurn([
        'read_sheet_range',
        { document_id: model, sheet: 'P&L', a1_range: 'A1:C9' },
      ]),
      textTurn(
        'Sales [model.xlsx v1, P&L!B2] costs [model.xlsx v1, P&L!B2:C3] tax [model.xlsx v1, P&L!D1] cash [model.xlsx v1, Cash!B2].',
      ),
    );

    const outcome = await ask();

    const sheetCell = (cellRange: string) => ({
      documentId: model,
      documentName: 'model.xlsx',
      version: 1,
      sheet: 'P&L',
      cellRange,
    });
    expect(outcome).toMatchObject({
      status: 'answered',
      answer:
        'Sales [model.xlsx v1, P&L!B2] costs [model.xlsx v1, P&L!B2:C3] tax cash.',
      citations: [sheetCell('B2'), sheetCell('B2:C3')],
    });
  });

  it('runs at most five tool calls in one turn and tells the model to ask again for the rest', async () => {
    scripted(
      toolTurn(
        ...Array.from({ length: 6 }, (): [string, unknown] => [
          'list_documents',
          {},
        ]),
      ),
      textTurn('Three documents.'),
    );

    const outcome = await ask();

    expect(sent(1).messages.at(-1)).toEqual({
      role: 'tool',
      tool_call_id: 'call-5',
      content: 'Too many tool calls in one turn; ask again',
    });
    expect(
      sent(1).messages.filter((message) => message.role === 'tool'),
    ).toHaveLength(6);
    expect(outcome.steps).toHaveLength(5);
  });

  it('counts an answer cut off at the token limit as answered', async () => {
    scripted(textTurn('Revenue was', 'length'));

    expect(await ask()).toMatchObject({
      status: 'answered',
      answer: 'Revenue was',
    });
  });

  it('fails when the AI returns no answer', async () => {
    scripted(textTurn(''));

    expect(await ask()).toEqual({
      status: 'failed',
      reason: 'The AI returned no answer',
      model: 'team-chat',
      credits: STEP_CREDITS,
      steps: [],
    });
  });

  it('answers from the text of the forced last turn and ignores tool calls it still makes', async () => {
    script = (call) =>
      (call.body as { tool_choice?: string }).tool_choice === 'none'
        ? {
            ...toolTurn(['list_documents', {}]),
            choices: [
              {
                finish_reason: 'tool_calls',
                message: {
                  ...toolTurn(['list_documents', {}]).choices[0]!.message,
                  content: 'Enough read.',
                },
              },
            ],
          }
        : toolTurn(['list_documents', {}]);

    const outcome = await ask();

    expect(outcome).toMatchObject({
      status: 'answered',
      answer: 'Enough read.',
    });
    expect(outcome.steps).toHaveLength(8);
    expect(provider.received).toHaveLength(9);
  });

  it('fails with the generic reason when the provider errors', async () => {
    provider.reply.status = 500;
    scripted(textTurn('never sent'));

    expect(await ask()).toEqual({
      status: 'failed',
      reason: 'The question could not be answered',
      model: 'team-chat',
      credits: 0,
      steps: [],
    });
  });

  it('fails with the generic reason when a tool throws, keeping the step it was on', async () => {
    scripted(
      toolTurn([
        'read_document_pages',
        { document_id: cim, from_page: 9_999_999_999, to_page: 1 },
      ]),
    );

    expect(await ask()).toEqual({
      status: 'failed',
      reason: 'The question could not be answered',
      model: 'team-chat',
      credits: STEP_CREDITS,
      steps: [
        {
          tool: 'read_document_pages',
          input: { document_id: cim, from_page: 9_999_999_999, to_page: 1 },
          isError: true,
        },
      ],
    });
  });

  it('stops before the next turn once the team is locked read-only mid question', async () => {
    scripted(toolTurn(['list_documents', {}]), textTurn('never reached'));
    const { data: config } = await team.admin
      .from('config')
      .select('enable_team_account_billing')
      .single()
      .throwOnError();
    const firstReply = holdNextReply();

    const asking = ask();
    const outcome = await (async () => {
      await firstReply.arrived;
      await team.admin
        .rpc('set_team_account_billing', { enabled: true })
        .throwOnError();
      await setLocked(true);
      firstReply.release();
      return await asking;
    })().finally(async () => {
      firstReply.release();
      await setLocked(false);
      await team.admin
        .rpc('set_team_account_billing', {
          enabled: config.enable_team_account_billing,
        })
        .throwOnError();
    });

    expect(outcome).toEqual({
      status: 'failed',
      reason: 'Team is read-only',
      model: 'team-chat',
      credits: STEP_CREDITS,
      steps: [{ tool: 'list_documents', input: {}, isError: false }],
    });
    expect(provider.received).toHaveLength(1);
  });

  it('runs the tools and system prompt its caller supplies', async () => {
    scripted(
      toolTurn(['look_up', { term: 'revenue' }]),
      textTurn('Revenue was 1.4 million [cim.pdf v1, p. 1].'),
    );
    const outcome = await ask({}, [], {
      system: 'Answer from the lookup only.',
      tools: [
        {
          name: 'look_up',
          description: 'Look a term up.',
          inputSchema: {
            type: 'object',
            properties: { term: { type: 'string' } },
            required: ['term'],
          },
        },
      ],
      runTool: async () => ({
        content: 'Revenue was 1.4 million [cim.pdf v1, p. 1].',
        citations: [{ ...cimPage1, excerpt: 'Revenue was 1.4 million.' }],
      }),
    });

    expect(sent(0).messages[0]).toEqual({
      role: 'system',
      content: 'Answer from the lookup only.',
    });
    expect(sent(0).tools.map(({ function: tool }) => tool.name)).toEqual([
      'look_up',
    ]);
    expect(outcome).toMatchObject({
      status: 'answered',
      answer: 'Revenue was 1.4 million [cim.pdf v1, p. 1].',
      citations: [{ ...cimPage1, excerpt: 'Revenue was 1.4 million.' }],
      steps: [{ tool: 'look_up', input: { term: 'revenue' }, isError: false }],
    });
  });

  it('refuses a tool call outside its mode and tells the model, without running it', async () => {
    scripted(
      toolTurn(['search_past_answers', { query: 'revenue' }]),
      textTurn('Revenue was 1.4 million [cim.pdf v1, p. 1].'),
    );

    const outcome = await ask({}, [], {
      system: 'Answer from the lookup only.',
      tools: [
        {
          name: 'look_up',
          description: 'Look a term up.',
          inputSchema: { type: 'object', properties: {}, required: [] },
        },
      ],
      runTool: async () => ({
        content: 'Revenue was 1.4 million [cim.pdf v1, p. 1].',
        citations: [{ ...cimPage1, excerpt: 'Revenue was 1.4 million.' }],
      }),
    });

    expect(sent(1).messages.at(-1)).toMatchObject({
      role: 'tool',
      tool_call_id: 'call-0',
      content: 'Unknown tool "search_past_answers".',
    });
    expect(outcome).toMatchObject({
      status: 'answered',
      answer: 'Revenue was 1.4 million.',
      citations: [],
      steps: [
        {
          tool: 'search_past_answers',
          input: { query: 'revenue' },
          isError: true,
        },
      ],
    });
  });
});
