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
let seller: IntegrationAccount;
let dealId: string;
let roomId: string;
let folderId: string;
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

async function savedCheck(id: string) {
  const { data } = await team.admin
    .from('seller_answer_check')
    .select('*')
    .eq('id', id)
    .single()
    .throwOnError();
  return data;
}

function post(body: Record<string, unknown>) {
  return POST(
    new Request('http://localhost/api/ai/seller-answer-check', {
      method: 'POST',
      body: JSON.stringify({ locale: 'en', ...body }),
    }),
  );
}

async function sellerThread(
  account: IntegrationAccount,
  room: string,
  messages: readonly (readonly ['seller' | 'internal', string])[],
  questionBody: string | null = null,
): Promise<{ questionId: string; messageIds: string[] }> {
  const { data: question } = await account.admin
    .from('seller_room_question')
    .insert({
      room_id: room,
      account_id: account.accountId,
      title: 'What was revenue?',
      body: questionBody,
    })
    .select('id')
    .single()
    .throwOnError();
  const start = Date.now() - 60_000;
  const { data: inserted } = await account.admin
    .from('seller_room_question_message')
    .insert(
      messages.map(([side, body], index) => ({
        question_id: question.id,
        side,
        body,
        created_at: new Date(start + index * 1000).toISOString(),
      })),
    )
    .select('id, created_at')
    .throwOnError();
  return {
    questionId: question.id,
    messageIds: inserted
      .toSorted((a, b) => a.created_at.localeCompare(b.created_at))
      .map(({ id }) => id),
  };
}

async function addDocument(
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

async function attach(questionId: string, documentId: string) {
  await team.admin
    .from('seller_room_question_file')
    .insert({
      question_id: questionId,
      dr_document_id: documentId,
      side: 'seller',
    })
    .throwOnError();
}

async function checksOf(messageId: string) {
  const { data } = await team.admin
    .from('seller_answer_check')
    .select('id, status')
    .eq('message_id', messageId)
    .throwOnError();
  return data;
}

beforeAll(async () => {
  process.env.ODB_STACK = 'local';
  process.env.ODB_ALLOW_PRIVATE_AI_URL = '1';
  [team, unconnected, seller] = await Promise.all([
    provisionAccount(),
    provisionAccount(),
    provisionAccount(),
  ]);
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
  const { data: room } = await team.user
    .rpc('ensure_seller_room', { deal_id: dealId })
    .throwOnError();
  roomId = room;
  await team.admin
    .from('seller_room_member')
    .insert({
      room_id: roomId,
      user_id: seller.userId,
      email: `seller-${seller.userId}@odb.test`,
      name: 'Sam Seller',
    })
    .throwOnError();
  const { data: folder } = await team.admin
    .from('dr_folder')
    .insert({ account_id: team.accountId, deal_id: dealId, name: 'Diligence' })
    .select('id')
    .single()
    .throwOnError();
  folderId = folder.id;
});

beforeEach(async () => {
  vi.useRealTimers();
  world.client = team.user;
  provider.received.length = 0;
  provider.reply.status = 200;
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
  for (const account of [team, unconnected, seller]) {
    await account.admin.from('accounts').delete().eq('id', account.accountId);
    await account.cleanup();
  }
});

describe('POST /api/ai/seller-answer-check', () => {
  it('streams progress, then the check it saved, charged to the check', async () => {
    const { questionId, messageIds } = await sellerThread(team, roomId, [
      ['seller', 'Revenue was 1.4 million in 2025.'],
    ]);
    const statements = await addDocument(
      'income.pdf',
      'Revenue was 1.4 million in fiscal 2025.',
    );
    await attach(questionId, statements);
    const claim = {
      claim: 'Revenue was 1.4 million in 2025',
      verdict: 'supported',
      labels: ['income.pdf v1, p. 1'],
    };
    scripted(
      toolTurn('read_document_pages', {
        document_id: statements,
        from_page: 1,
        to_page: 1,
      }),
      toolTurn('submit_check', { claims: [claim] }),
    );

    const response = await post({ messageId: messageIds[0] });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    const [read, submit, done, ...rest] = await events(response);
    expect(rest).toEqual([]);
    expect(read).toEqual({
      event: 'progress',
      data: { kind: 'read_pages', from: 1, to: 1 },
    });
    expect(submit).toEqual({ event: 'progress', data: { kind: 'working' } });
    expect(done!.event).toBe('done');
    const row = done!.data as { id: string };
    const saved = await savedCheck(row.id);
    expect(row).toEqual({
      id: saved.id,
      question_id: saved.question_id,
      message_id: saved.message_id,
      status: saved.status,
      overall: saved.overall,
      findings: saved.findings,
      follow_up: saved.follow_up,
      failure_reason: saved.failure_reason,
      credits_used: saved.credits_used,
      created_at: saved.created_at,
      finished_at: saved.finished_at,
    });
    expect(saved).toMatchObject({
      question_id: questionId,
      message_id: messageIds[0],
      deal_id: dealId,
      requested_by: team.userId,
      status: 'checked',
      overall: 'consistent',
      findings: [
        {
          claim: 'Revenue was 1.4 million in 2025',
          verdict: 'supported',
          citations: [
            {
              documentId: statements,
              documentName: 'income.pdf',
              version: 1,
              pageFrom: 1,
              pageTo: 1,
              fromOcr: false,
            },
          ],
        },
      ],
      follow_up: null,
      steps: [
        {
          tool: 'read_document_pages',
          input: { document_id: statements, from_page: 1, to_page: 1 },
          isError: false,
        },
        { tool: 'submit_check', input: { claims: [claim] }, isError: false },
      ],
      model: 'team-chat',
      credits_used: 2 * STEP_CREDITS,
    });
    expect(saved.finished_at).not.toBeNull();
    const { data: charged } = await team.admin
      .from('ai_call_log')
      .select('question_id, lender_ask_ai_draft_id, seller_answer_check_id')
      .eq('seller_answer_check_id', row.id)
      .throwOnError();
    expect(charged).toEqual([
      {
        question_id: null,
        lender_ask_ai_draft_id: null,
        seller_answer_check_id: row.id,
      },
      {
        question_id: null,
        lender_ask_ai_draft_id: null,
        seller_answer_check_id: row.id,
      },
    ]);
  });

  it("sends the whole thread and the seller's readable attachments, in the asker's locale", async () => {
    const { questionId, messageIds } = await sellerThread(
      team,
      roomId,
      [
        ['seller', 'About 1.4 million.'],
        ['internal', 'Can you send the statements?'],
        ['seller', 'Attached; revenue was 1.4 million.'],
      ],
      'For fiscal 2025, please.',
    );
    const readable = await addDocument(
      'cash-flow.pdf',
      'Cash was 0.2 million.',
    );
    const archive = await addDocument('photos.zip', null);
    const removed = await addDocument(
      'old-draft.pdf',
      'Revenue was 9 million.',
    );
    await appendDealEvent(team.admin, {
      dealId,
      aggregateType: 'dr_document',
      aggregateId: removed,
      eventType: 'dr_document.removed',
    });
    for (const documentId of [
      readable,
      readable,
      archive,
      removed,
      crypto.randomUUID(),
    ]) {
      await attach(questionId, documentId);
    }
    await team.admin
      .from('seller_room_question_file')
      .insert({
        question_id: questionId,
        dr_document_id: await addDocument('buyer-notes.pdf', 'Notes.'),
        side: 'internal',
      })
      .throwOnError();
    scripted(toolTurn('submit_check', { noClaims: true }));

    const [, done] = await events(await post({ messageId: messageIds[2] }));

    expect(done!.data).toMatchObject({
      status: 'checked',
      overall: 'no_claims',
    });
    const [system, request] = provider.received[0]!.body.messages;
    expect(system!.content).toContain('"Acme Plumbing"');
    expect(system!.content).toContain('English');
    const blocks = [
      ...request!.content.matchAll(
        /<msg-\w+ role="(\w+)">\n([^]*?)\n<\/msg-\w+>/g,
      ),
    ].map(([, role, text]) => [role, text]);
    expect(blocks).toEqual([
      ['buyer', 'What was revenue?\n\nFor fiscal 2025, please.'],
      ['seller', 'About 1.4 million.'],
      ['buyer', 'Can you send the statements?'],
      ['seller', 'Attached; revenue was 1.4 million.'],
      [
        'attachments',
        `cash-flow.pdf v1, document ${readable}\n3 attached documents could not be read.`,
      ],
    ]);
  });

  it('opens the thread with the question title alone when it has no body', async () => {
    const { messageIds } = await sellerThread(team, roomId, [
      ['seller', 'Revenue was 1.4 million.'],
    ]);
    scripted(toolTurn('submit_check', { noClaims: true }));

    await events(await post({ messageId: messageIds[0] }));

    expect(provider.received[0]!.body.messages[1]!.content).toContain(
      'role="buyer">\nWhat was revenue?\n</msg-',
    );
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
      () => scripted(textTurn('The answer looks right.')),
    ],
    [
      'failed',
      'meets a provider error',
      () => {
        provider.reply.status = 500;
      },
    ],
  ])(
    'saves a failed check with reason %s when the model %s',
    async (reason, _case, arrange) => {
      const { messageIds } = await sellerThread(team, roomId, [
        ['seller', 'Revenue was 1.4 million.'],
      ]);
      arrange();

      const received = await events(await post({ messageId: messageIds[0] }));

      const done = received.at(-1)!;
      expect(done.event).toBe('done');
      expect(done.data).toMatchObject({
        status: 'failed',
        failure_reason: reason,
        overall: null,
      });
      const saved = await savedCheck((done.data as { id: string }).id);
      expect(saved).toMatchObject({
        status: 'failed',
        failure_reason: reason,
        overall: null,
        findings: [],
        follow_up: null,
      });
      expect(saved.finished_at).not.toBeNull();
    },
  );

  it('saves a check whose credits ran out without findings', async () => {
    const { messageIds } = await sellerThread(team, roomId, [
      ['seller', 'Revenue was 1.4 million.'],
    ]);
    await team.admin
      .from('outreach_setting')
      .update({ ai_monthly_credit_cap: 0 })
      .eq('account_id', team.accountId)
      .throwOnError();

    const [done] = await events(await post({ messageId: messageIds[0] }));

    expect(done!.event).toBe('done');
    const saved = await savedCheck((done!.data as { id: string }).id);
    expect(saved).toMatchObject({
      status: 'credits_ran_out',
      failure_reason: null,
      overall: null,
      findings: [],
      follow_up: null,
      credits_used: 0,
    });
    expect(saved.finished_at).not.toBeNull();
    expect(provider.received).toEqual([]);
  });

  it('saves model output that holds NUL characters without them', async () => {
    const { messageIds } = await sellerThread(team, roomId, [
      ['seller', 'Revenue was 1.4 million.'],
    ]);
    scripted(
      toolTurn('no_such_tool', { 'k\u0000ey': 'nul \u0000 byte' }),
      toolTurn('submit_check', {
        claims: [
          { claim: 'Revenue\u0000 grew', verdict: 'unsupported', labels: [] },
        ],
        followUp: 'Which\u0000 year?',
      }),
    );

    const [, , done] = await events(await post({ messageId: messageIds[0] }));

    expect(done!.event).toBe('done');
    const saved = await savedCheck((done!.data as { id: string }).id);
    expect(saved).toMatchObject({
      status: 'checked',
      overall: 'no_evidence',
      findings: [
        { claim: 'Revenue grew', verdict: 'unsupported', citations: [] },
      ],
      follow_up: 'Which year?',
      steps: [
        { tool: 'no_such_tool', input: { key: 'nul  byte' }, isError: true },
        expect.objectContaining({ tool: 'submit_check', isError: false }),
      ],
    });
  });

  it('ends the stream with an error when the outcome cannot be saved', async () => {
    const { messageIds } = await sellerThread(team, roomId, [
      ['seller', 'Revenue was 1.4 million.'],
    ]);
    scripted(toolTurn('submit_check', { noClaims: true }));
    provider.reply.delayMs = 2000;

    const response = await post({ messageId: messageIds[0] });
    await vi.waitFor(() => expect(provider.received).toHaveLength(1));
    await team.admin
      .from('seller_room_question_message')
      .delete()
      .eq('id', messageIds[0]!)
      .throwOnError();
    const received = await events(response);
    provider.reply.delayMs = 0;

    expect(received).toEqual([
      { event: 'progress', data: { kind: 'working' } },
      {
        event: 'error',
        data: { error: 'The check could not be saved', code: 'save_failed' },
      },
    ]);
  });

  it('ends the stream with a generic error and marks the check failed when the run crashes', async () => {
    const { messageIds } = await sellerThread(team, roomId, [
      ['seller', 'Revenue was 1.4 million.'],
    ]);
    scripted(toolTurn('submit_check', { noClaims: true }));
    world.adminCrashes = 1;

    const received = await events(await post({ messageId: messageIds[0] }));

    expect(received).toEqual([
      { event: 'progress', data: { kind: 'working' } },
      {
        event: 'error',
        data: { error: 'Something went wrong', code: 'stream_failed' },
      },
    ]);
    const [check] = await checksOf(messageIds[0]!);
    const saved = await savedCheck(check!.id);
    expect(saved).toMatchObject({
      status: 'failed',
      failure_reason: 'failed',
      overall: null,
    });
    expect(saved.finished_at).not.toBeNull();
  });

  it('still closes the stream, without an unhandled rejection, when marking the crashed check fails', async () => {
    const { messageIds } = await sellerThread(team, roomId, [
      ['seller', 'Revenue was 1.4 million.'],
    ]);
    scripted(toolTurn('submit_check', { noClaims: true }));
    const unhandled: unknown[] = [];
    const record = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', record);
    world.adminCrashes = 2;

    const received = await events(await post({ messageId: messageIds[0] }));
    await new Promise((resolve) => setTimeout(resolve, 100));

    process.off('unhandledRejection', record);
    expect(received).toEqual([
      { event: 'progress', data: { kind: 'working' } },
      {
        event: 'error',
        data: { error: 'Something went wrong', code: 'stream_failed' },
      },
    ]);
    expect(unhandled).toEqual([]);
    expect(await checksOf(messageIds[0]!)).toEqual([
      expect.objectContaining({ status: 'running' }),
    ]);
  });

  it.each([
    ['inserted first with the later id', 'accepts', 0],
    ['inserted last with the earlier id', 'refuses', 1],
  ] as const)(
    'breaks a created_at tie by id: a seller answer %s %s',
    async (_case, verdict, sellerIndex) => {
      const { data: question } = await team.admin
        .from('seller_room_question')
        .insert({ room_id: roomId, account_id: team.accountId, title: 'Tie?' })
        .select('id')
        .single()
        .throwOnError();
      const at = new Date(Date.now() - 60_000).toISOString();
      const prefix = crypto.randomUUID().slice(0, 9);
      const ids = [
        `${prefix}0000-4000-8000-000000000001`,
        `${prefix}0000-4000-8000-000000000002`,
      ];
      const seller = {
        side: 'seller' as const,
        body: 'Revenue was 1.4 million.',
      };
      const buyer = { side: 'internal' as const, body: 'Which year?' };
      const rows =
        sellerIndex === 0
          ? [
              { ...seller, id: ids[1]! },
              { ...buyer, id: ids[0]! },
            ]
          : [
              { ...buyer, id: ids[1]! },
              { ...seller, id: ids[0]! },
            ];
      await team.admin
        .from('seller_room_question_message')
        .insert(
          rows.map((row) => ({
            ...row,
            question_id: question.id,
            created_at: at,
          })),
        )
        .throwOnError();
      const sellerId = rows.find((row) => row.side === 'seller')!.id;
      scripted(toolTurn('submit_check', { noClaims: true }));

      const response = await post({ messageId: sellerId });

      if (verdict === 'accepts') {
        expect(response.status).toBe(200);
        await events(response);
      } else {
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({
          code: 'not_latest_answer',
        });
      }
    },
  );

  it('refuses a team member who reads the room as a seller but does not work the deal', async () => {
    const counsel = await provisionAccount();
    await team.admin
      .from('accounts_memberships')
      .insert({
        user_id: counsel.userId,
        account_id: team.accountId,
        account_role: 'counsel',
      })
      .throwOnError();
    await team.admin
      .from('seller_room_member')
      .insert({
        room_id: roomId,
        user_id: counsel.userId,
        email: `counsel-${counsel.userId}@odb.test`,
        name: 'Casey Counsel',
      })
      .throwOnError();
    const { messageIds } = await sellerThread(team, roomId, [
      ['seller', 'Revenue was 1.4 million.'],
    ]);
    world.client = counsel.user;

    const response = await post({ messageId: messageIds[0] });

    await team.admin
      .from('accounts_memberships')
      .delete()
      .eq('user_id', counsel.userId)
      .eq('account_id', team.accountId)
      .throwOnError();
    await counsel.admin.from('accounts').delete().eq('id', counsel.accountId);
    await counsel.cleanup();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Only the deal team can check seller answers.',
      code: 'not_deal_team',
    });
    expect(await checksOf(messageIds[0]!)).toEqual([]);
  });

  it('passes on a start error it does not recognise', async () => {
    const { messageIds } = await sellerThread(team, roomId, [
      ['seller', 'Revenue was 1.4 million.'],
    ]);
    const unexpected = {
      code: '23505',
      message:
        'duplicate key value violates unique constraint "some_other_index"',
    };
    world.client = Object.assign(Object.create(team.user), {
      rpc: (name: string, args: unknown) =>
        name === 'start_seller_answer_check'
          ? Promise.resolve({ data: null, error: unexpected })
          : team.user.rpc(name, args as Record<string, unknown>),
    });

    await expect(post({ messageId: messageIds[0] })).rejects.toMatchObject(
      unexpected,
    );
  });

  it.each([
    ['just under', -1000, 'refuses'],
    ['just over', 1000, 'skips'],
  ] as const)(
    'treats an attachment with no text %s 15 minutes after upload as processing only before the line',
    async (_case, offset, verdict) => {
      const { questionId, messageIds } = await sellerThread(team, roomId, [
        ['seller', 'Revenue was 1.4 million.'],
      ]);
      const stuck = await addDocument('stuck.pdf', null);
      await attach(questionId, stuck);
      const { data: document } = await team.admin
        .from('dr_document')
        .select('created_at')
        .eq('id', stuck)
        .single()
        .throwOnError();
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(Date.parse(document.created_at) + 15 * 60_000 + offset);
      scripted(toolTurn('submit_check', { noClaims: true }));

      const response = await post({ messageId: messageIds[0] });

      if (verdict === 'refuses') {
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({
          code: 'attachments_processing',
        });
      } else {
        await events(response);
        expect(provider.received[0]!.body.messages[1]!.content).toContain(
          '1 attached document could not be read.',
        );
      }
    },
  );

  it("refuses while an attachment's current version has no text yet, even if an earlier one does", async () => {
    const { questionId, messageIds } = await sellerThread(team, roomId, [
      ['seller', 'See the revised statements.'],
    ]);
    await attach(
      questionId,
      await addDocument('revised.pdf', 'Revenue was 1.3 million.', {
        version: 2,
        textVersion: 1,
      }),
    );

    const response = await post({ messageId: messageIds[0] });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: 'attachments_processing',
    });
    expect(provider.received).toEqual([]);
  });

  it('refuses a signed-out request', async () => {
    world.client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const response = await post({ messageId: crypto.randomUUID() });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: 'Authentication required',
      code: 'unauthenticated',
    });
  });

  it.each([
    [
      'a message id that is not a string',
      { messageId: 5 },
      'messageId is required',
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
      const { messageIds } = await sellerThread(team, roomId, [
        ['seller', 'Revenue was 1.4 million.'],
      ]);

      const response = await post({ messageId: messageIds[0], ...fields });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error, code });
      expect(await checksOf(messageIds[0]!)).toEqual([]);
    },
  );

  it.each([
    ['is not a uuid', async () => 'message-1'],
    ['does not exist', async () => crypto.randomUUID()],
    [
      "belongs to another team's deal",
      async () => {
        const otherDeal = await seedDeal(
          unconnected.admin,
          unconnected.accountId,
          unconnected.userId,
          { description: 'Beta Roofing' },
        );
        const { data: otherRoom } = await unconnected.user
          .rpc('ensure_seller_room', { deal_id: otherDeal })
          .throwOnError();
        const { messageIds } = await sellerThread(unconnected, otherRoom, [
          ['seller', 'Revenue was 2 million.'],
        ]);
        return messageIds[0]!;
      },
    ],
  ])('refuses a message that %s as not found', async (_case, message) => {
    const response = await post({ messageId: await message() });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: 'Message not found',
      code: 'message_not_found',
    });
    expect(provider.received).toEqual([]);
  });

  it('refuses a seller who can read the answer but does not work the deal', async () => {
    const { messageIds } = await sellerThread(team, roomId, [
      ['seller', 'Revenue was 1.4 million.'],
    ]);
    world.client = seller.user;

    const response = await post({ messageId: messageIds[0] });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: 'Message not found',
      code: 'message_not_found',
    });
    expect(await checksOf(messageIds[0]!)).toEqual([]);
  });

  it.each([
    [
      'a seller answer the buyer has replied to',
      [
        ['seller', 'Revenue was 1.4 million.'],
        ['internal', 'Which year?'],
      ],
      0,
    ],
    [
      'a seller answer the seller has answered again',
      [
        ['seller', 'Revenue was 1.4 million.'],
        ['seller', 'Sorry, 1.5 million.'],
      ],
      0,
    ],
    ['a buyer message', [['internal', 'Any update?']], 0],
  ] as const)(
    'refuses %s without spending credits',
    async (_case, messages, checked) => {
      const { messageIds } = await sellerThread(team, roomId, messages);

      const response = await post({ messageId: messageIds[checked] });

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        error: "Only the seller's latest answer can be checked",
        code: 'not_latest_answer',
      });
      expect(await checksOf(messageIds[checked]!)).toEqual([]);
      expect(provider.received).toEqual([]);
    },
  );

  it('refuses a seller answer with no text without spending credits', async () => {
    const { messageIds } = await sellerThread(team, roomId, [
      ['seller', ' \n\t '],
    ]);

    const response = await post({ messageId: messageIds[0] });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'The answer has no text to check',
      code: 'empty_answer',
    });
    expect(await checksOf(messageIds[0]!)).toEqual([]);
    expect(provider.received).toEqual([]);
  });

  it('refuses while an attached file is still being processed, without spending credits', async () => {
    const { questionId, messageIds } = await sellerThread(team, roomId, [
      ['seller', 'See the attached statements.'],
    ]);
    await attach(
      questionId,
      await addDocument('statements.pdf', 'Revenue was 1.4 million.'),
    );
    await attach(questionId, await addDocument('ledger.xlsx', null));

    const response = await post({ messageId: messageIds[0] });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'An attached file is still being processed; try again shortly',
      code: 'attachments_processing',
    });
    expect(await checksOf(messageIds[0]!)).toEqual([]);
    expect(provider.received).toEqual([]);
  });

  it("refuses a check of an answer a teammate's check is already running on", async () => {
    const teammate = await provisionAccount();
    await team.admin
      .from('accounts_memberships')
      .insert({
        user_id: teammate.userId,
        account_id: team.accountId,
        account_role: 'member',
      })
      .throwOnError();
    const { messageIds } = await sellerThread(team, roomId, [
      ['seller', 'Revenue was 1.4 million.'],
    ]);
    const { data: running } = await teammate.user
      .rpc('start_seller_answer_check', { p_message_id: messageIds[0]! })
      .throwOnError();

    const response = await post({ messageId: messageIds[0] });

    await team.admin
      .from('seller_answer_check')
      .update({
        status: 'failed',
        failure_reason: 'failed',
        finished_at: new Date().toISOString(),
      })
      .eq('id', running)
      .throwOnError();
    await team.admin
      .from('accounts_memberships')
      .delete()
      .eq('user_id', teammate.userId)
      .eq('account_id', team.accountId)
      .throwOnError();
    await teammate.admin.from('accounts').delete().eq('id', teammate.accountId);
    await teammate.cleanup();

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'A check of this answer is already running',
      code: 'already_running',
    });
    expect(await checksOf(messageIds[0]!)).toEqual([
      { id: running, status: 'failed' },
    ]);
    expect(provider.received).toEqual([]);
  });

  it('refuses an answer the buyer replies to while the check is starting', async () => {
    const { questionId, messageIds } = await sellerThread(team, roomId, [
      ['seller', 'Revenue was 1.4 million.'],
    ]);
    world.client = Object.assign(Object.create(team.user), {
      rpc: (name: string, args: Record<string, unknown>) =>
        name === 'start_seller_answer_check'
          ? team.admin
              .from('seller_room_question_message')
              .insert({
                question_id: questionId,
                side: 'internal',
                body: 'Which year?',
              })
              .throwOnError()
              .then(() => team.user.rpc(name, args))
          : team.user.rpc(name, args),
    });

    const response = await post({ messageId: messageIds[0] });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Only the seller's latest answer can be checked",
      code: 'not_latest_answer',
    });
    expect(await checksOf(messageIds[0]!)).toEqual([]);
    expect(provider.received).toEqual([]);
  });

  it('refuses a locked team before starting a check', async () => {
    const { messageIds } = await sellerThread(team, roomId, [
      ['seller', 'Revenue was 1.4 million.'],
    ]);
    await team.admin
      .from('accounts')
      .update({
        trial_ends_at: new Date(Date.now() - 86_400_000).toISOString(),
      })
      .eq('id', team.accountId)
      .throwOnError();

    const response = await post({ messageId: messageIds[0] });

    await team.admin
      .from('accounts')
      .update({
        trial_ends_at: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .eq('id', team.accountId)
      .throwOnError();
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'team_read_only' });
    expect(await checksOf(messageIds[0]!)).toEqual([]);
  });

  it('refuses a team with no AI provider before starting a check', async () => {
    world.client = unconnected.user;
    const otherDeal = await seedDeal(
      unconnected.admin,
      unconnected.accountId,
      unconnected.userId,
      { description: 'Gamma Electric' },
    );
    const { data: otherRoom } = await unconnected.user
      .rpc('ensure_seller_room', { deal_id: otherDeal })
      .throwOnError();
    const { messageIds } = await sellerThread(unconnected, otherRoom, [
      ['seller', 'Revenue was 2 million.'],
    ]);

    const response = await post({ messageId: messageIds[0] });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'Connect an AI provider first',
      code: 'connect_ai_provider',
    });
    expect(await checksOf(messageIds[0]!)).toEqual([]);
  });
});
