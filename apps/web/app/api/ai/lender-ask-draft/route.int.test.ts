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

import { fakeAiProvider } from '../../../../../../packages/workflows/test-support/fake-ai-provider';
import {
  appendDealEvent,
  provisionAccount,
  seedDeal,
  type IntegrationAccount,
} from '../../../../../../packages/workflows/test-support/integration-harness';

const world = vi.hoisted(() => ({
  client: null as unknown as SupabaseClient,
  adminCrashes: 0,
}));

vi.mock('@odb/supabase/server', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@odb/supabase/server')>();
  return {
    ...original,
    getSupabaseServerClient: () => world.client,
    getSupabaseServerAdminClient: () => {
      if (world.adminCrashes > 0) {
        world.adminCrashes -= 1;
        throw new Error('The admin client is down');
      }
      return original.getSupabaseServerAdminClient();
    },
  };
});

import { POST } from './route';

let team: IntegrationAccount;
let unconnected: IntegrationAccount;
let lender: IntegrationAccount;
let teammate: IntegrationAccount;
let dealId: string;
let roomId: string;
let sellerRoomId: string;
let privateFile: string;
let packageFile: string;
let privateFolder: string;
let provider: Awaited<ReturnType<typeof fakeAiProvider>>;
let script: (index: number) => unknown;
const usage = { prompt_tokens: 12, completion_tokens: 5 };
const STEP_CREDITS = (12 * 2 + 5 * 4) / 1e4;

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

async function savedDraft(id: string) {
  const { data } = await team.admin
    .from('lender_ask_ai_draft')
    .select('*')
    .eq('id', id)
    .single()
    .throwOnError();
  return data;
}

async function draftsOf(askId: string) {
  const { data } = await team.admin
    .from('lender_ask_ai_draft')
    .select('id, status, requested_by')
    .eq('ask_id', askId)
    .order('created_at')
    .throwOnError();
  return data;
}

function post(body: Record<string, unknown>) {
  return POST(
    new Request('http://localhost/api/ai/lender-ask-draft', {
      method: 'POST',
      body: JSON.stringify({ locale: 'en', ...body }),
    }),
  );
}

async function addFolder(name: string) {
  const { data } = await team.admin
    .from('dr_folder')
    .insert({ account_id: team.accountId, deal_id: dealId, name })
    .select('id')
    .single()
    .throwOnError();
  return data.id;
}

async function addDocument(
  folderId: string,
  name: string,
  text: string | null,
  {
    version = 1,
    textVersion = version,
  }: { version?: number; textVersion?: number } = {},
) {
  const id = crypto.randomUUID();
  await appendDealEvent(team.admin, {
    dealId,
    aggregateType: 'dr_document',
    aggregateId: id,
    eventType: 'dr_document.added',
    payload: {
      folder_id: folderId,
      name,
      storage_path: `deal/${dealId}/${id}`,
      version,
    },
  });
  if (text !== null) {
    await team.admin
      .from('document_segment')
      .insert({
        account_id: team.accountId,
        deal_id: dealId,
        dr_document_id: id,
        document_version: textVersion,
        segment_index: 0,
        kind: 'page',
        page_from: 1,
        page_to: 1,
        text,
        from_ocr: false,
        content_hash: `${id}-0`,
      })
      .throwOnError();
  }
  return id;
}

async function lenderAsk(
  messages: readonly (readonly ['lender' | 'internal', string])[] = [],
  {
    kind = 'ask',
    body = null,
  }: { kind?: 'ask' | 'form'; body?: string | null } = {},
): Promise<string> {
  const { data: ask } = await team.admin
    .from('lender_ask')
    .insert({
      room_id: roomId,
      account_id: team.accountId,
      kind,
      return_route: kind === 'form' ? 'upload' : null,
      title: 'What was revenue?',
      body,
      created_by: lender.userId,
    })
    .select('id')
    .single()
    .throwOnError();
  const start = Date.now() - 60_000;
  if (messages.length > 0) {
    await team.admin
      .from('lender_ask_message')
      .insert(
        messages.map(([side, text], index) => ({
          ask_id: ask.id,
          side,
          body: text,
          created_at: new Date(start + index * 1000).toISOString(),
        })),
      )
      .throwOnError();
  }
  return ask.id;
}

async function routeToSeller(
  askId: string,
  messages: readonly (readonly ['seller' | 'internal', string])[],
) {
  const { data: question } = await team.admin
    .from('seller_room_question')
    .insert({
      room_id: sellerRoomId,
      account_id: team.accountId,
      title: 'Lender asks about revenue',
    })
    .select('id')
    .single()
    .throwOnError();
  const start = Date.now() - 60_000;
  await team.admin
    .from('seller_room_question_message')
    .insert(
      messages.map(([side, text], index) => ({
        question_id: question.id,
        side,
        body: text,
        created_at: new Date(start + index * 1000).toISOString(),
      })),
    )
    .throwOnError();
  await team.admin
    .from('seller_room_question_route')
    .insert({ question_id: question.id, lender_ask_id: askId })
    .throwOnError();
}

async function attachToAsk(
  askId: string,
  documentId: string,
  role: 'attachment' | 'fulfilment' = 'attachment',
) {
  await team.admin
    .from('lender_ask_file')
    .insert({ ask_id: askId, dr_document_id: documentId, role })
    .throwOnError();
}

async function joinTeam(account: IntegrationAccount) {
  await team.admin
    .from('accounts_memberships')
    .insert({
      user_id: account.userId,
      account_id: team.accountId,
      account_role: 'member',
    })
    .throwOnError();
}

beforeAll(async () => {
  process.env.ODB_STACK = 'local';
  process.env.ODB_ALLOW_PRIVATE_AI_URL = '1';
  [team, unconnected, lender, teammate] = await Promise.all([
    provisionAccount(),
    provisionAccount(),
    provisionAccount(),
    provisionAccount(),
  ]);
  await joinTeam(teammate);
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
  const master = await addFolder('Lender package');
  privateFolder = await addFolder('Lender A only');
  packageFile = await addDocument(
    master,
    'cim.pdf',
    'Revenue was 1.4 million in fiscal 2025.',
  );
  privateFile = await addDocument(
    privateFolder,
    'monthly.pdf',
    'Monthly revenue was about 0.12 million.',
  );
  await team.admin
    .from('lender_package')
    .insert({
      deal_id: dealId,
      account_id: team.accountId,
      master_folder_id: master,
    })
    .throwOnError();
  roomId = crypto.randomUUID();
  await team.admin
    .from('lender_room')
    .insert({
      id: roomId,
      account_id: team.accountId,
      deal_id: dealId,
      name: 'Lender A',
      private_folder_id: privateFolder,
    })
    .throwOnError();
  await team.admin
    .from('lender_room_member')
    .insert({
      room_id: roomId,
      user_id: lender.userId,
      email: `lender-${lender.userId}@odb.test`,
    })
    .throwOnError();
  await team.admin
    .from('lender_faq_entry')
    .insert({
      account_id: team.accountId,
      deal_id: dealId,
      question: 'What security is offered?',
      answer: 'The facility is senior secured by all company assets.',
      status: 'published',
    })
    .throwOnError();
  const { data: sellerRoom } = await team.user
    .rpc('ensure_seller_room', { deal_id: dealId })
    .throwOnError();
  sellerRoomId = sellerRoom;
});

beforeEach(async () => {
  vi.useRealTimers();
  world.client = team.user;
  provider.received.length = 0;
  provider.reply.status = 200;
  provider.reply.delayMs = 0;
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
    await account.admin
      .from('lender_room')
      .delete()
      .eq('account_id', account.accountId)
      .throwOnError();
  }
  await team.admin
    .from('accounts_memberships')
    .delete()
    .eq('user_id', teammate.userId)
    .eq('account_id', team.accountId)
    .throwOnError();
  for (const account of [team, unconnected, lender, teammate]) {
    await account.admin.from('accounts').delete().eq('id', account.accountId);
    await account.cleanup();
  }
});

describe('POST /api/ai/lender-ask-draft', () => {
  it('streams progress, then the draft it saved with its labels, suggesting only files the reply can attach', async () => {
    const askId = await lenderAsk();
    const draft =
      'Revenue was 1.4 million [cim.pdf v1, p. 1], about 0.12 million a month [monthly.pdf v1, p. 1].';
    scripted(
      toolTurn('search_documents', { query: 'revenue' }),
      toolTurn('read_document_pages', {
        document_id: privateFile,
        from_page: 1,
        to_page: 1,
      }),
      toolTurn('submit_draft', { draft }),
    );

    const response = await post({ askId });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    const [search, read, submit, done, ...rest] = await events(response);
    expect(rest).toEqual([]);
    expect(search).toEqual({
      event: 'progress',
      data: { kind: 'search', query: 'revenue' },
    });
    expect(read).toEqual({
      event: 'progress',
      data: { kind: 'read_pages', from: 1, to: 1 },
    });
    expect(submit).toEqual({ event: 'progress', data: { kind: 'working' } });
    expect(done!.event).toBe('done');
    const row = done!.data as { id: string };
    const saved = await savedDraft(row.id);
    expect(row).toEqual({
      id: saved.id,
      ask_id: askId,
      requested_by: team.userId,
      status: 'ready',
      body: saved.body,
      citations: saved.citations,
      suggested_document_ids: [privateFile],
      failure_reason: null,
      credits_used: saved.credits_used,
      created_at: saved.created_at,
      finished_at: saved.finished_at,
      not_found: false,
    });
    expect(saved).toMatchObject({
      ask_id: askId,
      room_id: roomId,
      deal_id: dealId,
      requested_by: team.userId,
      status: 'ready',
      body: draft,
      citations: [
        expect.objectContaining({
          documentId: packageFile,
          documentName: 'cim.pdf',
          pageFrom: 1,
        }),
        expect.objectContaining({
          documentId: privateFile,
          documentName: 'monthly.pdf',
          pageFrom: 1,
        }),
      ],
      suggested_document_ids: [privateFile],
      not_found: false,
      model: 'team-chat',
      credits_used: 3 * STEP_CREDITS,
    });
    expect(saved.finished_at).not.toBeNull();
    const { data: charged } = await team.admin
      .from('ai_call_log')
      .select('question_id, lender_ask_ai_draft_id, seller_answer_check_id')
      .eq('lender_ask_ai_draft_id', row.id)
      .throwOnError();
    expect(charged).toHaveLength(3);
    expect(charged).toContainEqual({
      question_id: null,
      lender_ask_ai_draft_id: row.id,
      seller_answer_check_id: null,
    });
  });

  it("sends the whole ask thread and its routed seller answers, in the asker's locale, with only the room tools", async () => {
    const askId = await lenderAsk(
      [
        ['internal', 'Looking into it.'],
        ['lender', 'Monthly, if you have it.'],
      ],
      { body: 'For fiscal 2025, please.' },
    );
    await lenderAsk([['lender', 'Another ask entirely.']]);
    await routeToSeller(askId, [
      ['internal', 'The lender wants revenue.'],
      ['seller', 'Revenue was 1.4 million; see the CIM.'],
    ]);
    scripted(toolTurn('submit_draft', { draft: 'Hello.', notFound: true }));

    const [, done] = await events(await post({ askId }));

    expect(done!.data).toMatchObject({ status: 'ready', body: 'Hello.' });
    const { messages, tools } = provider.received[0]!.body as unknown as {
      messages: { content: string }[];
      tools: { function: { name: string } }[];
    };
    expect(messages[0]!.content).toContain('English');
    const blocks = [
      ...messages[1]!.content.matchAll(
        /<msg-\w+ role="(\w+)">\n([^]*?)\n<\/msg-\w+>/g,
      ),
    ].map(([, role, text]) => [role, text]);
    expect(blocks).toEqual([
      ['lender', 'What was revenue?\n\nFor fiscal 2025, please.'],
      ['team', 'Looking into it.'],
      ['lender', 'Monthly, if you have it.'],
      ['seller', 'Revenue was 1.4 million; see the CIM.'],
    ]);
    const offered = tools.map((tool) => tool.function.name);
    expect(offered).toContain('search_faq');
    expect(offered).toContain('submit_draft');
    expect(offered).not.toContain('search_past_answers');
  });

  it("sends the lender's readable attachments that the room shows, by exact version, and counts the rest", async () => {
    const askId = await lenderAsk();
    const rentRoll = await addDocument(
      privateFolder,
      'rent-roll.pdf',
      'Rent roll as of June.',
      { version: 2 },
    );
    const outsideRoom = await addDocument(
      await addFolder('Diligence'),
      'board-minutes.pdf',
      'Board minutes.',
    );
    const archive = await addDocument(privateFolder, 'photos.zip', null);
    const removed = await addDocument(privateFolder, 'old.pdf', 'Old text.');
    await appendDealEvent(team.admin, {
      dealId,
      aggregateType: 'dr_document',
      aggregateId: removed,
      eventType: 'dr_document.removed',
    });
    for (const documentId of [
      privateFile,
      privateFile,
      rentRoll,
      outsideRoom,
      archive,
      removed,
    ]) {
      await attachToAsk(askId, documentId);
    }
    await attachToAsk(askId, packageFile, 'fulfilment');
    scripted(toolTurn('submit_draft', { draft: 'Hello.', notFound: true }));

    await events(await post({ askId }));

    const { messages } = provider.received[0]!.body;
    expect(messages[0]!.content).toMatch(/role="attachments"/);
    expect(messages[1]!.content).toContain(
      `role="attachments">\nmonthly.pdf v1, document ${privateFile}\nrent-roll.pdf v2, document ${rentRoll}\n1 attached document could not be read.\n</msg-`,
    );
    expect(messages[1]!.content).not.toContain('board-minutes.pdf');
    expect(messages[1]!.content).not.toContain(packageFile);
  });

  it('refuses buyer counsel on the deal, who does not work the lender room', async () => {
    const askId = await lenderAsk();
    const counsel = await provisionAccount();
    await team.admin
      .from('deal_counsel')
      .insert({
        account_id: team.accountId,
        deal_id: dealId,
        side: 'buyer',
        user_id: counsel.userId,
        email: `counsel-${counsel.userId}@odb.test`,
        name: 'Casey Counsel',
      })
      .throwOnError();
    world.client = counsel.user;
    const { data: counselCanWork } = await counsel.user
      .rpc('can_work_lender_room', { room_id: roomId })
      .throwOnError();

    const response = await post({ askId });

    await team.admin
      .from('deal_counsel')
      .delete()
      .eq('user_id', counsel.userId)
      .throwOnError();
    await counsel.admin.from('accounts').delete().eq('id', counsel.accountId);
    await counsel.cleanup();
    expect(counselCanWork).toBe(false);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: 'ask_not_found' });
    expect(await draftsOf(askId)).toEqual([]);
  });

  it('accepts a draft that rests on an FAQ entry the run found, citing nothing', async () => {
    const askId = await lenderAsk();
    scripted(
      toolTurn('search_faq', { query: 'security' }),
      toolTurn('submit_draft', {
        draft: 'Yes. The facility is senior secured by all company assets.',
      }),
    );

    const [, , done] = await events(await post({ askId }));

    expect(done!.data).toMatchObject({
      status: 'ready',
      body: 'Yes. The facility is senior secured by all company assets.',
      citations: [],
      not_found: false,
    });
  });

  it('sends back a draft that rests on nothing in the FAQ entries the search returned', async () => {
    const askId = await lenderAsk();
    scripted(
      toolTurn('search_faq', { query: 'security' }),
      toolTurn('submit_draft', {
        draft: 'Covenants are tested every quarter.',
      }),
      toolTurn('submit_draft', { draft: 'Not found.', notFound: true }),
    );

    const received = await events(await post({ askId }));

    const saved = await savedDraft(
      (received.at(-1)!.data as { id: string }).id,
    );
    expect(saved.steps).toMatchObject([
      { tool: 'search_faq', isError: false },
      { tool: 'submit_draft', isError: true },
      { tool: 'submit_draft', isError: false },
    ]);
    expect(JSON.stringify(provider.received[2]!.body.messages.at(-1))).toMatch(
      /must cite a room document/,
    );
  });

  it("does not count the FAQ tool's own note as an FAQ entry", async () => {
    const askId = await lenderAsk();
    scripted(
      toolTurn('search_faq', { query: 'security' }),
      toolTurn('submit_draft', {
        draft: 'The terms are already published to this room.',
      }),
      toolTurn('submit_draft', { draft: 'Not found.', notFound: true }),
    );

    const received = await events(await post({ askId }));

    const saved = await savedDraft(
      (received.at(-1)!.data as { id: string }).id,
    );
    expect(saved.steps).toMatchObject([
      { tool: 'search_faq', isError: false },
      { tool: 'submit_draft', isError: true },
      { tool: 'submit_draft', isError: false },
    ]);
    expect(JSON.stringify(provider.received[2]!.body.messages.at(-1))).toMatch(
      /must cite a room document/,
    );
  });

  it('does not count a figure the model echoed into a failed tool call as shown', async () => {
    const askId = await lenderAsk();
    await routeToSeller(askId, [['seller', 'EBITDA was 4,250,000 last year.']]);
    scripted(
      toolTurn('read_document_pages', {
        document_id: privateFile,
        from_page: 1,
        to_page: 1,
      }),
      toolTurn('read_sheet_range', {
        document_id: privateFile,
        sheet: 'EBITDA 4250000',
        a1_range: 'A1:B2',
      }),
      toolTurn('submit_draft', {
        draft: 'EBITDA was 4,250,000 [monthly.pdf v1, p. 1].',
      }),
      toolTurn('submit_draft', { draft: 'Not found.', notFound: true }),
    );

    const received = await events(await post({ askId }));

    const saved = await savedDraft(
      (received.at(-1)!.data as { id: string }).id,
    );
    expect(saved.steps).toMatchObject([
      { tool: 'read_document_pages', isError: false },
      { tool: 'read_sheet_range', isError: true },
      { tool: 'submit_draft', isError: true },
      { tool: 'submit_draft', isError: false },
    ]);
    expect(
      JSON.stringify(provider.received[3]!.body.messages.at(-1)),
    ).toContain('repeats \\"4250000\\"');
  });

  it('sends back a found draft that cites nothing when the FAQ search found nothing', async () => {
    const askId = await lenderAsk();
    scripted(
      toolTurn('search_faq', { query: 'zebra' }),
      toolTurn('submit_draft', { draft: 'Yes, it is.' }),
      toolTurn('submit_draft', { draft: 'Not found.', notFound: true }),
    );

    const received = await events(await post({ askId }));

    const saved = await savedDraft(
      (received.at(-1)!.data as { id: string }).id,
    );
    expect(saved).toMatchObject({
      status: 'ready',
      body: 'Not found.',
      not_found: true,
    });
    expect(saved.steps).toMatchObject([
      { tool: 'search_faq', isError: false },
      { tool: 'submit_draft', isError: true },
      { tool: 'submit_draft', isError: false },
    ]);
    expect(JSON.stringify(provider.received[2]!.body.messages.at(-1))).toMatch(
      /must cite a room document/,
    );
  });

  it('sends back a draft that repeats a seller figure nothing in the room shows', async () => {
    const askId = await lenderAsk();
    await routeToSeller(askId, [['seller', 'EBITDA was 0.3 million in 2025.']]);
    scripted(
      toolTurn('read_document_pages', {
        document_id: packageFile,
        from_page: 1,
        to_page: 1,
      }),
      toolTurn('submit_draft', {
        draft: 'EBITDA was 0.3 million [cim.pdf v1, p. 1].',
      }),
      toolTurn('submit_draft', {
        draft: 'Revenue was 1.4 million in fiscal 2025 [cim.pdf v1, p. 1].',
      }),
    );

    const received = await events(await post({ askId }));

    const saved = await savedDraft(
      (received.at(-1)!.data as { id: string }).id,
    );
    expect(saved).toMatchObject({
      status: 'ready',
      body: 'Revenue was 1.4 million in fiscal 2025 [cim.pdf v1, p. 1].',
    });
    expect(saved.steps).toMatchObject([
      { tool: 'read_document_pages', isError: false },
      { tool: 'submit_draft', isError: true },
      { tool: 'submit_draft', isError: false },
    ]);
    expect(
      JSON.stringify(provider.received[2]!.body.messages.at(-1)),
    ).toContain('0.3');
  });

  it('gives the draft no way to see a document outside the room', async () => {
    const askId = await lenderAsk();
    const outside = await addDocument(
      await addFolder('Board'),
      'minutes.pdf',
      'Board minutes approve a special dividend.',
    );
    scripted(
      toolTurn('search_documents', { query: 'special dividend' }),
      toolTurn('read_document_pages', {
        document_id: outside,
        from_page: 1,
        to_page: 1,
      }),
      toolTurn('submit_draft', { draft: 'Not found.', notFound: true }),
    );

    const received = await events(await post({ askId }));

    const saved = await savedDraft(
      (received.at(-1)!.data as { id: string }).id,
    );
    expect(saved.steps).toMatchObject([
      { tool: 'search_documents' },
      { tool: 'read_document_pages', isError: true },
      { tool: 'submit_draft', isError: false },
    ]);
    const toolReplies = JSON.stringify(provider.received[2]!.body.messages);
    expect(toolReplies).not.toContain('Board minutes');
    expect(toolReplies).not.toContain('minutes.pdf');
  });

  it('saves the draft without suggested files when working them out fails', async () => {
    const askId = await lenderAsk();
    scripted(
      toolTurn('read_document_pages', {
        document_id: privateFile,
        from_page: 1,
        to_page: 1,
      }),
      toolTurn('submit_draft', {
        draft: 'About 0.12 million a month [monthly.pdf v1, p. 1].',
      }),
    );
    world.client = Object.assign(Object.create(team.user), {
      from: (table: string) => {
        if (table === 'dr_folder') {
          throw new Error('The folder tree is unavailable');
        }
        return team.user.from(table);
      },
    });

    const received = await events(await post({ askId }));

    const done = received.at(-1)!;
    expect(done.event).toBe('done');
    expect(await savedDraft((done.data as { id: string }).id)).toMatchObject({
      status: 'ready',
      body: 'About 0.12 million a month [monthly.pdf v1, p. 1].',
      citations: [expect.objectContaining({ documentId: privateFile })],
      suggested_document_ids: [],
    });
  });

  it('refuses a teammate who reads the room as a lender but does not work the deal', async () => {
    const askId = await lenderAsk();
    const viewer = await provisionAccount();
    await team.admin
      .from('accounts_memberships')
      .insert({
        user_id: viewer.userId,
        account_id: team.accountId,
        account_role: 'counsel',
      })
      .throwOnError();
    await team.admin
      .from('lender_room_member')
      .insert({
        room_id: roomId,
        user_id: viewer.userId,
        email: `viewer-${viewer.userId}@odb.test`,
      })
      .throwOnError();
    world.client = viewer.user;

    const response = await post({ askId });

    await team.admin
      .from('accounts_memberships')
      .delete()
      .eq('user_id', viewer.userId)
      .eq('account_id', team.accountId)
      .throwOnError();
    await viewer.admin.from('accounts').delete().eq('id', viewer.accountId);
    await viewer.cleanup();
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: 'ask_not_found' });
    expect(await draftsOf(askId)).toEqual([]);
  });

  it("marks a draft whose answer the room's documents do not hold", async () => {
    const askId = await lenderAsk();
    scripted(
      toolTurn('submit_draft', {
        draft: "We could not find this in the room's documents.",
        notFound: true,
      }),
    );

    const [, done] = await events(await post({ askId }));

    expect(done!.data).toMatchObject({
      status: 'ready',
      citations: [],
      suggested_document_ids: [],
      not_found: true,
    });
    expect(await savedDraft((done!.data as { id: string }).id)).toMatchObject({
      status: 'ready',
      not_found: true,
    });
  });

  it.each([
    ['just under', -1000, 'refuses'],
    ['just over', 1000, 'skips'],
  ] as const)(
    'treats an attachment with no text %s 15 minutes after upload as processing only before the line',
    async (_case, offset, verdict) => {
      const askId = await lenderAsk();
      const stuck = await addDocument(privateFolder, 'stuck.pdf', null);
      await attachToAsk(askId, stuck);
      const { data: document } = await team.admin
        .from('dr_document')
        .select('created_at')
        .eq('id', stuck)
        .single()
        .throwOnError();
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(Date.parse(document.created_at) + 15 * 60_000 + offset);
      scripted(toolTurn('submit_draft', { draft: 'Hello.', notFound: true }));

      const response = await post({ askId });

      if (verdict === 'refuses') {
        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({
          error: 'An attached file is still being processed; try again shortly',
          code: 'attachments_processing',
        });
        expect(await draftsOf(askId)).toEqual([]);
        expect(provider.received).toEqual([]);
      } else {
        await events(response);
        expect(provider.received[0]!.body.messages[1]!.content).toContain(
          '1 attached document could not be read.',
        );
      }
    },
  );

  it("refuses while an attachment's current version has no text yet, even if an earlier one does", async () => {
    const askId = await lenderAsk();
    await attachToAsk(
      askId,
      await addDocument(privateFolder, 'revised.pdf', 'Old text.', {
        version: 2,
        textVersion: 1,
      }),
    );

    const response = await post({ askId });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: 'attachments_processing',
    });
    expect(provider.received).toEqual([]);
  });

  it.each(['closed', 'withdrawn'] as const)(
    'refuses a %s ask without spending credits',
    async (status) => {
      const askId = await lenderAsk();
      await team.admin
        .from('lender_ask')
        .update({ status })
        .eq('id', askId)
        .throwOnError();

      const response = await post({ askId });

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        error: 'This ask is closed',
        code: 'ask_closed',
      });
      expect(await draftsOf(askId)).toEqual([]);
      expect(provider.received).toEqual([]);
    },
  );

  it('keeps several drafts of one ask, each by whoever clicked', async () => {
    const askId = await lenderAsk();
    scripted(toolTurn('submit_draft', { draft: 'First.', notFound: true }));
    await events(await post({ askId }));
    provider.received.length = 0;
    world.client = teammate.user;
    scripted(toolTurn('submit_draft', { draft: 'Second.', notFound: true }));

    await events(await post({ askId }));

    expect(await draftsOf(askId)).toEqual([
      expect.objectContaining({ status: 'ready', requested_by: team.userId }),
      expect.objectContaining({
        status: 'ready',
        requested_by: teammate.userId,
      }),
    ]);
  });

  it.each([
    [
      'too_long',
      'keeps reading past its last round',
      () => {
        script = () => toolTurn('list_documents', {});
      },
    ],
    [
      'no_submit',
      'stops without submitting',
      () => scripted(textTurn('Revenue was 1.4 million.')),
    ],
    [
      'failed',
      'meets a provider error',
      () => {
        provider.reply.status = 500;
      },
    ],
  ])(
    'saves a failed draft with reason %s when the model %s',
    async (reason, _case, arrange) => {
      const askId = await lenderAsk();
      arrange();

      const received = await events(await post({ askId }));

      const done = received.at(-1)!;
      expect(done.event).toBe('done');
      const saved = await savedDraft((done.data as { id: string }).id);
      expect(saved).toMatchObject({
        status: 'failed',
        failure_reason: reason,
        body: null,
        citations: [],
        suggested_document_ids: [],
      });
      expect(saved.finished_at).not.toBeNull();
    },
  );

  it('saves a draft whose credits ran out without a body', async () => {
    const askId = await lenderAsk();
    await team.admin
      .from('outreach_setting')
      .update({ ai_monthly_credit_cap: 0 })
      .eq('account_id', team.accountId)
      .throwOnError();

    const [done] = await events(await post({ askId }));

    expect(done!.event).toBe('done');
    const saved = await savedDraft((done!.data as { id: string }).id);
    expect(saved).toMatchObject({
      status: 'credits_ran_out',
      failure_reason: null,
      body: null,
      credits_used: 0,
    });
    expect(saved.finished_at).not.toBeNull();
    expect(provider.received).toEqual([]);
  });

  it('saves model output that holds NUL characters without them', async () => {
    const askId = await lenderAsk();
    scripted(
      toolTurn('submit_draft', {
        draft: 'Reve\u0000nue grew.',
        notFound: true,
      }),
    );

    const [, done] = await events(await post({ askId }));

    expect(done!.data).toMatchObject({
      status: 'ready',
      body: 'Revenue grew.',
    });
  });

  it('ends the stream with an error when the outcome cannot be saved', async () => {
    const askId = await lenderAsk();
    scripted(toolTurn('submit_draft', { draft: 'Hi.', notFound: true }));
    provider.reply.delayMs = 2000;

    const response = await post({ askId });
    await vi.waitFor(() => expect(provider.received).toHaveLength(1));
    await team.admin.from('lender_ask').delete().eq('id', askId).throwOnError();
    const received = await events(response);

    expect(received).toEqual([
      { event: 'progress', data: { kind: 'working' } },
      {
        event: 'error',
        data: { error: 'The draft could not be saved', code: 'save_failed' },
      },
    ]);
  });

  it('ends the stream with a generic error and marks the draft failed when the run crashes', async () => {
    const askId = await lenderAsk();
    scripted(toolTurn('submit_draft', { draft: 'Hi.', notFound: true }));
    world.adminCrashes = 1;

    const received = await events(await post({ askId }));

    expect(received).toEqual([
      { event: 'progress', data: { kind: 'working' } },
      {
        event: 'error',
        data: { error: 'Something went wrong', code: 'stream_failed' },
      },
    ]);
    const [draft] = await draftsOf(askId);
    expect(await savedDraft(draft!.id)).toMatchObject({
      status: 'failed',
      failure_reason: 'failed',
      body: null,
    });
  });

  it('refuses a second draft of an ask while the same person has one running', async () => {
    const askId = await lenderAsk();
    const { data: running } = await team.user
      .rpc('start_lender_ask_ai_draft', { p_ask_id: askId })
      .throwOnError();

    const response = await post({ askId });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'A draft of this ask is already running',
      code: 'already_running',
    });
    expect(await draftsOf(askId)).toEqual([
      expect.objectContaining({ id: running, status: 'running' }),
    ]);
    expect(provider.received).toEqual([]);
  });

  it("drafts while a teammate's draft of the same ask is running", async () => {
    const askId = await lenderAsk();
    await teammate.user
      .rpc('start_lender_ask_ai_draft', { p_ask_id: askId })
      .throwOnError();
    scripted(toolTurn('submit_draft', { draft: 'Hi.', notFound: true }));

    const response = await post({ askId });

    expect(response.status).toBe(200);
    await events(response);
  });

  it('refuses a form ask without spending credits', async () => {
    const askId = await lenderAsk([], { kind: 'form' });

    const response = await post({ askId });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'A form gets no AI draft',
      code: 'form_ask',
    });
    expect(await draftsOf(askId)).toEqual([]);
    expect(provider.received).toEqual([]);
  });

  it('passes on a start error it does not recognise', async () => {
    const askId = await lenderAsk();
    const unexpected = {
      code: '23505',
      message:
        'duplicate key value violates unique constraint "some_other_index"',
    };
    world.client = Object.assign(Object.create(team.user), {
      rpc: (name: string, args: unknown) =>
        name === 'start_lender_ask_ai_draft'
          ? Promise.resolve({ data: null, error: unexpected })
          : team.user.rpc(name, args as Record<string, unknown>),
    });

    await expect(post({ askId })).rejects.toMatchObject(unexpected);
  });

  it('refuses a signed-out request', async () => {
    world.client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const response = await post({ askId: crypto.randomUUID() });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: 'Authentication required',
      code: 'unauthenticated',
    });
  });

  it.each([
    [
      'an ask id that is not a string',
      { askId: 5 },
      'askId is required',
      'invalid_request',
    ],
    ['an unknown locale', { locale: 'fr' }, 'Unknown locale', 'unknown_locale'],
    [
      'a missing locale',
      { locale: undefined },
      'Unknown locale',
      'unknown_locale',
    ],
  ])(
    'refuses %s before writing anything',
    async (_case, fields, error, code) => {
      const askId = await lenderAsk();

      const response = await post({ askId, ...fields });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error, code });
      expect(await draftsOf(askId)).toEqual([]);
    },
  );

  it.each([
    ['is not a uuid', async () => 'ask-1'],
    ['does not exist', async () => crypto.randomUUID()],
    [
      "belongs to another team's room",
      async () => {
        world.client = unconnected.user;
        return lenderAsk();
      },
    ],
  ])('refuses an ask that %s as not found', async (_case, ask) => {
    const askId = await ask();

    const response = await post({ askId });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: 'Ask not found',
      code: 'ask_not_found',
    });
    expect(provider.received).toEqual([]);
  });

  it('refuses a lender who can read the ask but does not work the deal', async () => {
    const askId = await lenderAsk();
    world.client = lender.user;

    const response = await post({ askId });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: 'ask_not_found' });
    expect(await draftsOf(askId)).toEqual([]);
  });

  it('refuses a locked team before starting a draft', async () => {
    const askId = await lenderAsk();
    await team.admin
      .from('accounts')
      .update({
        trial_ends_at: new Date(Date.now() - 86_400_000).toISOString(),
      })
      .eq('id', team.accountId)
      .throwOnError();

    const response = await post({ askId });

    await team.admin
      .from('accounts')
      .update({
        trial_ends_at: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .eq('id', team.accountId)
      .throwOnError();
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'team_read_only' });
    expect(await draftsOf(askId)).toEqual([]);
  });

  it('refuses a team with no AI provider before starting a draft', async () => {
    const askId = await lenderAsk();
    const otherDeal = await seedDeal(
      unconnected.admin,
      unconnected.accountId,
      unconnected.userId,
      { description: 'Gamma Electric' },
    );
    const otherFolder = await unconnected.admin
      .from('dr_folder')
      .insert({
        account_id: unconnected.accountId,
        deal_id: otherDeal,
        name: 'Lender B only',
      })
      .select('id')
      .single()
      .throwOnError();
    const otherRoom = crypto.randomUUID();
    await unconnected.admin
      .from('lender_room')
      .insert({
        id: otherRoom,
        account_id: unconnected.accountId,
        deal_id: otherDeal,
        name: 'Lender B',
        private_folder_id: otherFolder.data.id,
      })
      .throwOnError();
    const { data: otherAsk } = await unconnected.admin
      .from('lender_ask')
      .insert({
        room_id: otherRoom,
        account_id: unconnected.accountId,
        kind: 'ask',
        title: 'What was revenue?',
      })
      .select('id')
      .single()
      .throwOnError();
    world.client = unconnected.user;

    const response = await post({ askId: otherAsk.id });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'Connect an AI provider first',
      code: 'connect_ai_provider',
    });
    expect(await draftsOf(askId)).toEqual([]);
  });
});
