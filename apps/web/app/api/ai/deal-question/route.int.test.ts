import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  fakeAiProvider,
  type ReceivedAiCall,
} from '../../../../../../packages/workflows/test-support/fake-ai-provider';
import {
  appendDealEvent,
  provisionAccount,
  seedDeal,
  type IntegrationAccount,
} from '../../../../../../packages/workflows/test-support/integration-harness';

const world = vi.hoisted(() => ({
  client: null as unknown as SupabaseClient,
}));

vi.mock('@odb/supabase/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@odb/supabase/server')>()),
  getSupabaseServerClient: () => world.client,
}));

import { POST } from './route';

let team: IntegrationAccount;
let unconnected: IntegrationAccount;
let dealId: string;
let provider: Awaited<ReturnType<typeof fakeAiProvider>>;
let script: (index: number) => unknown;
const cim = crypto.randomUUID();
const usage = { prompt_tokens: 12, completion_tokens: 5 };

function toolTurn(name: string, input: unknown) {
  return {
    choices: [
      {
        finish_reason: 'tool_calls',
        message: {
          content: null,
          tool_calls: [
            {
              id: 'call-0',
              type: 'function',
              function: { name, arguments: JSON.stringify(input) },
            },
          ],
        },
      },
    ],
    usage,
  };
}

function textTurn(text: string) {
  return {
    choices: [{ finish_reason: 'stop', message: { content: text } }],
    usage,
  };
}

function scripted(...turns: unknown[]) {
  script = (index) => turns[index];
}

function sentMessages(call: ReceivedAiCall) {
  return call.body.messages;
}

function post(body: Record<string, unknown>) {
  return POST(
    new Request('http://localhost/api/ai/deal-question', {
      method: 'POST',
      body: JSON.stringify({ locale: 'en', ...body }),
    }),
  );
}

async function threadsIn(deal: string) {
  const { data } = await team.admin
    .from('deal_ai_thread')
    .select('id')
    .eq('deal_id', deal)
    .order('id')
    .throwOnError();
  return data;
}

async function questionsIn(deal: string) {
  const { data } = await team.admin
    .from('deal_ai_question')
    .select('id')
    .eq('deal_id', deal)
    .throwOnError();
  return data;
}

type Event = { event: string; data: unknown };

async function events(response: Response): Promise<Event[]> {
  return (await response.text())
    .split('\n\n')
    .filter((block) => block !== '')
    .map((block) => {
      const [event, data] = block.split('\n');
      return {
        event: event!.replace('event: ', ''),
        data: JSON.parse(data!.replace('data: ', '')),
      };
    });
}

async function savedQuestion(id: string) {
  const { data } = await team.admin
    .from('deal_ai_question')
    .select('*')
    .eq('id', id)
    .single()
    .throwOnError();
  return data;
}

async function newThread() {
  const { data } = await team.admin
    .from('deal_ai_thread')
    .insert({ deal_id: dealId })
    .select('id')
    .single()
    .throwOnError();
  return data.id as string;
}

async function finishedQuestion(
  threadId: string,
  question: string,
  answer: string,
  status: 'answered' | 'failed' = 'answered',
) {
  await team.admin
    .from('deal_ai_question')
    .insert({
      thread_id: threadId,
      deal_id: dealId,
      asked_by: team.userId,
      question,
      answer,
      status,
      finished_at: new Date().toISOString(),
    })
    .throwOnError();
}

beforeAll(async () => {
  process.env.ODB_STACK = 'local';
  process.env.ODB_ALLOW_PRIVATE_AI_URL = '1';
  team = await provisionAccount();
  unconnected = await provisionAccount();
  provider = await fakeAiProvider({
    status: 200,
    body: null,
    answer: () => script(provider.received.length - 1),
  });
  await team.user
    .rpc('save_llm_endpoint', {
      p_account_id: team.accountId,
      p_provider: 'openai_compatible',
      p_model: 'team-chat',
      p_base_url: provider.baseUrl,
      p_api_key: 'sk-vault',
      p_embedding_model: 'team-embed',
      p_input_price_per_mtok: 2,
      p_cached_input_price_per_mtok: 1,
      p_output_price_per_mtok: 4,
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
  await appendDealEvent(team.admin, {
    dealId,
    aggregateType: 'dr_document',
    aggregateId: cim,
    eventType: 'dr_document.added',
    payload: {
      folder_id: folder.id,
      name: 'cim.pdf',
      storage_path: `deal/${dealId}/${cim}`,
      version: 1,
    },
  });
  await team.admin
    .from('document_segment')
    .insert({
      account_id: team.accountId,
      deal_id: dealId,
      dr_document_id: cim,
      document_version: 1,
      segment_index: 0,
      kind: 'page',
      page_from: 1,
      page_to: 1,
      text: 'Revenue was 1.4 million with an EBITDA addback.',
      from_ocr: false,
      content_hash: `${cim}-0`,
    })
    .throwOnError();
});

beforeEach(async () => {
  world.client = team.user;
  provider.received.length = 0;
  await team.admin
    .from('outreach_setting')
    .update({ ai_monthly_credit_cap: 10000 })
    .eq('account_id', team.accountId)
    .throwOnError();
});

afterAll(async () => {
  provider.close();
  delete process.env.ODB_STACK;
  delete process.env.ODB_ALLOW_PRIVATE_AI_URL;
  for (const account of [team, unconnected]) {
    await account.admin.from('accounts').delete().eq('id', account.accountId);
    await account.cleanup();
  }
});

describe('POST /api/ai/deal-question', () => {
  it('streams progress, then the answered question it saved in a new thread', async () => {
    scripted(
      toolTurn('search_documents', { query: 'EBITDA' }),
      textTurn('Revenue was 1.4 million [cim.pdf v1, p. 1].'),
    );

    const response = await post({ dealId, question: 'What was revenue?' });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    const [progress, done, ...rest] = await events(response);
    expect(rest).toEqual([]);
    expect(progress).toEqual({
      event: 'progress',
      data: { kind: 'search', query: 'EBITDA' },
    });
    const row = done!.data as { id: string; thread_id: string };
    expect(done!.event).toBe('done');
    const saved = await savedQuestion(row.id);
    expect(row).toEqual({
      id: saved.id,
      thread_id: saved.thread_id,
      question: saved.question,
      answer: saved.answer,
      status: saved.status,
      citations: saved.citations,
      credits_used: saved.credits_used,
      created_at: saved.created_at,
      finished_at: saved.finished_at,
    });
    expect(saved).toMatchObject({
      deal_id: dealId,
      asked_by: team.userId,
      question: 'What was revenue?',
      status: 'answered',
      answer: 'Revenue was 1.4 million [cim.pdf v1, p. 1].',
      citations: [
        {
          documentId: cim,
          documentName: 'cim.pdf',
          version: 1,
          pageFrom: 1,
          pageTo: 1,
        },
      ],
      steps: [
        {
          tool: 'search_documents',
          input: { query: 'EBITDA' },
          isError: false,
        },
      ],
      model: 'team-chat',
      credits_used: 2 * ((12 * 2 + 5 * 4) / 1e4),
    });
    expect(saved.finished_at).not.toBeNull();
    const { data: thread } = await team.admin
      .from('deal_ai_thread')
      .select('deal_id')
      .eq('id', row.thread_id)
      .single()
      .throwOnError();
    expect(thread.deal_id).toBe(dealId);
  });

  it("asks about the deal by its name, in the asker's locale", async () => {
    scripted(textTurn('Nothing found.'));

    await events(await post({ dealId, question: 'What was revenue?' }));

    const system = sentMessages(provider.received[0]!)[0]!;
    expect(system.content).toContain('Acme Plumbing');
    expect(system.content).toContain('English');
  });

  it("follows up on the thread's earlier answered questions, in order", async () => {
    const threadId = await newThread();
    await finishedQuestion(threadId, 'Who owns it?', 'The founder.');
    await finishedQuestion(threadId, 'Broken?', 'boom', 'failed');
    await finishedQuestion(threadId, 'Since when?', 'Since 2004.');
    scripted(textTurn('Nothing found.'));

    const [done] = await events(
      await post({ dealId, threadId, question: 'Any debt?' }),
    );

    expect((done!.data as { thread_id: string }).thread_id).toBe(threadId);
    expect(
      sentMessages(provider.received[0]!)
        .slice(1)
        .map(({ role, content }) => [role, content]),
    ).toEqual([
      ['user', 'Who owns it?'],
      ['assistant', 'The founder.'],
      ['user', 'Since when?'],
      ['assistant', 'Since 2004.'],
      ['user', 'Any debt?'],
    ]);
  });

  it('saves a failed question with its reason as the answer', async () => {
    scripted(textTurn(''));

    const [done] = await events(await post({ dealId, question: 'Revenue?' }));

    const saved = await savedQuestion((done!.data as { id: string }).id);
    expect(saved).toMatchObject({
      status: 'failed',
      answer: 'The AI returned no answer',
    });
    expect(done!.data).toMatchObject({
      status: 'failed',
      answer: 'The AI returned no answer',
    });
  });

  it('saves a question whose credits ran out without an answer', async () => {
    await team.admin
      .from('outreach_setting')
      .update({ ai_monthly_credit_cap: 0 })
      .eq('account_id', team.accountId)
      .throwOnError();
    scripted(textTurn('Too late.'));

    const [done] = await events(await post({ dealId, question: 'Revenue?' }));

    const saved = await savedQuestion((done!.data as { id: string }).id);
    expect(saved).toMatchObject({ status: 'credits_ran_out', answer: null });
    expect(saved.finished_at).not.toBeNull();
  });

  it('still saves the outcome after the asker closes the stream', async () => {
    scripted(
      toolTurn('search_documents', { query: 'EBITDA' }),
      textTurn('Revenue was 1.4 million [cim.pdf v1, p. 1].'),
    );

    const threadId = await newThread();

    const response = await post({
      dealId,
      threadId,
      question: 'What was revenue?',
    });
    await response.body!.cancel();

    await vi.waitFor(
      async () => {
        const { data } = await team.admin
          .from('deal_ai_question')
          .select('status, answer')
          .eq('thread_id', threadId)
          .single()
          .throwOnError();
        expect(data).toEqual({
          status: 'answered',
          answer: 'Revenue was 1.4 million [cim.pdf v1, p. 1].',
        });
      },
      { timeout: 10_000 },
    );
  });

  it('refuses a second question while one is running', async () => {
    const threadId = await newThread();
    await team.user
      .from('deal_ai_question')
      .insert({ thread_id: threadId, deal_id: dealId, question: 'First?' })
      .throwOnError();

    const response = await post({ dealId, threadId, question: 'Second?' });

    await team.admin
      .from('deal_ai_question')
      .update({ status: 'failed', finished_at: new Date().toISOString() })
      .eq('thread_id', threadId)
      .throwOnError();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'A question is already running',
      code: 'already_running',
    });
    expect(provider.received).toEqual([]);
  });

  it('leaves no empty thread when the first question of a new thread is refused', async () => {
    const threadId = await newThread();
    await team.user
      .from('deal_ai_question')
      .insert({ thread_id: threadId, deal_id: dealId, question: 'First?' })
      .throwOnError();
    const threadsBefore = await threadsIn(dealId);

    const response = await post({ dealId, question: 'Second?' });

    const threadsAfter = await threadsIn(dealId);
    await team.admin
      .from('deal_ai_question')
      .update({ status: 'failed', finished_at: new Date().toISOString() })
      .eq('thread_id', threadId)
      .throwOnError();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'A question is already running',
      code: 'already_running',
    });
    expect(threadsAfter).toEqual(threadsBefore);
  });

  it('refuses a question in a full thread', async () => {
    const threadId = await newThread();
    for (let index = 0; index < 20; index += 1) {
      await finishedQuestion(threadId, `Question ${index}?`, 'Answer.');
    }

    const response = await post({ dealId, threadId, question: 'One more?' });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'This thread is full; start a new one',
      code: 'thread_full',
    });
    expect(provider.received).toEqual([]);
  });

  it('refuses a team with no AI provider before saving a question', async () => {
    world.client = unconnected.user;
    const otherDeal = await seedDeal(
      unconnected.admin,
      unconnected.accountId,
      unconnected.userId,
      { description: 'Beta Roofing' },
    );

    const response = await post({ dealId: otherDeal, question: 'Revenue?' });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'Connect an AI provider first',
      code: 'connect_ai_provider',
    });
    const { data } = await unconnected.admin
      .from('deal_ai_question')
      .select('id')
      .eq('deal_id', otherDeal)
      .throwOnError();
    expect(data).toEqual([]);
  });

  it("refuses a deal the asker can't see as not found", async () => {
    world.client = unconnected.user;

    const response = await post({ dealId, question: 'Revenue?' });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: 'Deal not found',
      code: 'deal_not_found',
    });
    expect(provider.received).toEqual([]);
  });

  it('refuses a signed-out request', async () => {
    world.client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const response = await post({ dealId, question: 'Revenue?' });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: 'Authentication required',
      code: 'unauthenticated',
    });
  });

  it('refuses a locked team before saving a question', async () => {
    await team.admin
      .from('accounts')
      .update({
        trial_ends_at: new Date(Date.now() - 86_400_000).toISOString(),
      })
      .eq('id', team.accountId)
      .throwOnError();

    const response = await post({ dealId, question: 'Revenue?' });

    await team.admin
      .from('accounts')
      .update({
        trial_ends_at: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .eq('id', team.accountId)
      .throwOnError();
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'team_read_only' });
    expect(provider.received).toEqual([]);
  });

  it('saves model output that holds NUL characters without them', async () => {
    scripted(
      toolTurn('no_such_tool', {
        'k\u0000ey': 'nul \u0000 byte',
        text: 'a\\u0000b',
      }),
      textTurn('Nothing\u0000 found.'),
    );

    const [progress, done, ...rest] = await events(
      await post({ dealId, question: 'Revenue?' }),
    );

    expect(progress).toEqual({ event: 'progress', data: { kind: 'working' } });
    expect(done!.event).toBe('done');
    expect(rest).toEqual([]);
    const saved = await savedQuestion((done!.data as { id: string }).id);
    expect(saved).toMatchObject({
      status: 'answered',
      answer: 'Nothing found.',
      steps: [
        {
          tool: 'no_such_tool',
          input: { key: 'nul  byte', text: 'a\\u0000b' },
          isError: true,
        },
      ],
    });
  });

  it('ends the stream with an error when the outcome cannot be saved, leaving the question to expire', async () => {
    const threadId = await newThread();
    scripted(textTurn('Nothing found.'));
    provider.reply.delayMs = 2000;

    const response = await post({ dealId, threadId, question: 'Revenue?' });
    await vi.waitFor(() => expect(provider.received).toHaveLength(1));
    await team.admin
      .from('deal_ai_question')
      .update({ created_at: new Date(Date.now() - 11 * 60_000).toISOString() })
      .eq('thread_id', threadId)
      .throwOnError();
    await team.user
      .from('deal_ai_question')
      .delete()
      .eq('thread_id', threadId)
      .throwOnError();
    const received = await events(response);
    provider.reply.delayMs = 0;

    expect(received).toEqual([
      {
        event: 'error',
        data: { error: 'The answer could not be saved', code: 'save_failed' },
      },
    ]);
  });

  it('accepts a question of 4,000 characters', async () => {
    scripted(textTurn('Nothing found.'));

    const [done] = await events(
      await post({ dealId, question: 'q'.repeat(4000) }),
    );

    expect(done!.event).toBe('done');
  });

  it.each([
    [
      'a question that is not a string',
      { question: 5 },
      'dealId and question are required',
      'invalid_request',
    ],
    ['an empty question', { question: '' }, 'Ask a question', 'empty_question'],
    [
      'a blank question',
      { question: '  \n\t ' },
      'Ask a question',
      'empty_question',
    ],
    [
      'a 4,001 character question',
      { question: 'q'.repeat(4001) },
      'A question can be at most 4,000 characters',
      'question_too_long',
    ],
    [
      'an unknown locale',
      { question: 'Revenue?', locale: 'fr' },
      'Unknown locale',
      'unknown_locale',
    ],
    [
      'a missing locale',
      { question: 'Revenue?', locale: undefined },
      'Unknown locale',
      'unknown_locale',
    ],
    [
      'a thread id that is not a string',
      { question: 'Revenue?', threadId: 7 },
      'threadId must be a string',
      'invalid_request',
    ],
  ])(
    'refuses %s before writing anything',
    async (_case, fields, error, code) => {
      const before = await questionsIn(dealId);

      const response = await post({ dealId, ...fields });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error, code });
      expect(await questionsIn(dealId)).toEqual(before);
      expect(provider.received).toEqual([]);
    },
  );

  it.each([
    ['is not a uuid', async () => 'thread-1'],
    [
      'belongs to another deal',
      async () => {
        const otherDeal = await seedDeal(
          team.admin,
          team.accountId,
          team.userId,
          { description: 'Gamma Electric' },
        );
        const { data } = await team.admin
          .from('deal_ai_thread')
          .insert({ deal_id: otherDeal })
          .select('id')
          .single()
          .throwOnError();
        return data.id as string;
      },
    ],
  ])('refuses a thread that %s as not found', async (_case, thread) => {
    const before = await questionsIn(dealId);

    const response = await post({
      dealId,
      threadId: await thread(),
      question: 'Revenue?',
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: 'Thread not found',
      code: 'thread_not_found',
    });
    expect(await questionsIn(dealId)).toEqual(before);
    expect(provider.received).toEqual([]);
  });
});
