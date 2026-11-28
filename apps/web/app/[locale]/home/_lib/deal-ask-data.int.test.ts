import type { SupabaseClient } from '@supabase/supabase-js';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  admin,
  cleanUp,
  newDeal,
  provisionPerson,
  provisionTeam,
  type Person,
} from '@odb/seller-rooms/test-support/world.ts';

const world = vi.hoisted(() => ({
  client: null as unknown as SupabaseClient,
}));

vi.mock('@odb/supabase/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@odb/supabase/server')>()),
  getSupabaseServerClient: () => world.client,
}));

import {
  aiThreadDeal,
  dealName,
  listAiThreads,
  listAskableDeals,
  loadDealAsk,
  teamAiConnected,
} from './deal-ask-data';

let owner: Person;
let member: Person;
let outsider: Person;
let teamId: string;
let otherTeamId: string;
let pagedTeam: string;
let acme: string;
let birch: string;
let elsewhere: string;

const NOW = Date.now();

function hoursAgo(hours: number) {
  return new Date(NOW - hours * 60 * 60 * 1000).toISOString();
}

async function namedDeal(team: string, name: string) {
  const dealId = await newDeal(team, owner);
  const { data: deal } = await admin
    .from('deal')
    .select('firm_id')
    .eq('id', dealId)
    .single()
    .throwOnError();
  await admin
    .from('firm')
    .update({ name })
    .eq('id', deal.firm_id)
    .throwOnError();
  return dealId;
}

async function dealEvent(
  dealId: string,
  eventType: string,
  payload: Record<string, string>,
) {
  await admin
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: 'deal',
      p_aggregate_id: dealId,
      p_event_type: eventType,
      p_payload: payload,
      p_actor_kind: 'service',
    })
    .throwOnError();
}

async function thread(dealId: string, asked: [string, number][]) {
  const threadId = crypto.randomUUID();
  await admin
    .from('deal_ai_thread')
    .insert({ id: threadId, deal_id: dealId })
    .throwOnError();
  await admin
    .from('deal_ai_question')
    .insert(
      asked.map(([question, hours]) => ({
        thread_id: threadId,
        deal_id: dealId,
        asked_by: owner.userId,
        question,
        answer: 'An answer.',
        status: 'answered' as const,
        created_at: hoursAgo(hours),
        finished_at: hoursAgo(hours),
      })),
    )
    .throwOnError();
  return threadId;
}

beforeAll(async () => {
  owner = await provisionPerson();
  member = await provisionPerson();
  outsider = await provisionPerson();
  teamId = await provisionTeam(owner, 'Harbor Holdings');
  await admin
    .from('accounts_memberships')
    .insert({
      account_id: teamId,
      user_id: member.userId,
      account_role: 'member',
    })
    .throwOnError();
  otherTeamId = await provisionTeam(owner, 'Other Holdings');
  world.client = owner.client;
  acme = await namedDeal(teamId, 'Acme Plumbing');
  birch = await namedDeal(teamId, 'Birch Bakery');
  elsewhere = await namedDeal(otherTeamId, 'Elsewhere Inc');
});

afterAll(async () => {
  await cleanUp([teamId, otherTeamId, pagedTeam]);
});

describe('listAiThreads', () => {
  it("lists the team's threads across deals, newest activity first, by first question and deal name", async () => {
    const revenue = await thread(acme, [
      ['What was revenue?', 3],
      ['And margins?', 1],
    ]);
    const lease = await thread(birch, [['When does the lease end?', 2]]);
    await thread(elsewhere, [['Not this team', 0]]);

    expect(await listAiThreads(teamId)).toEqual({
      next: null,
      threads: [
        {
          id: revenue,
          dealId: acme,
          dealName: 'Acme Plumbing',
          question: 'What was revenue?',
          lastAskedAt: expect.stringMatching(
            new RegExp(`^${hoursAgo(1).slice(0, 16)}`),
          ),
        },
        {
          id: lease,
          dealId: birch,
          dealName: 'Birch Bakery',
          question: 'When does the lease end?',
          lastAskedAt: expect.stringMatching(
            new RegExp(`^${hoursAgo(2).slice(0, 16)}`),
          ),
        },
      ],
    });
  });

  it('pages 50 threads at a time, newest activity first, continuing after the cursor without repeats', async () => {
    pagedTeam = await provisionTeam(owner, 'Paged Holdings');
    const deal = await namedDeal(pagedTeam, 'Paged Deal');
    const threadIds = Array.from({ length: 53 }, () => crypto.randomUUID());
    await admin
      .from('deal_ai_thread')
      .insert(threadIds.map((id) => ({ id, deal_id: deal })))
      .throwOnError();
    await admin
      .from('deal_ai_question')
      .insert(
        threadIds.map((threadId, index) => ({
          thread_id: threadId,
          deal_id: deal,
          asked_by: owner.userId,
          question: `Question ${index}`,
          answer: 'An answer.',
          status: 'answered' as const,
          created_at: hoursAgo(index % 5),
          finished_at: hoursAgo(index % 5),
        })),
      )
      .throwOnError();
    const expected = threadIds
      .map((id, index) => ({ id, at: hoursAgo(index % 5) }))
      .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id))
      .map((thread) => thread.id);

    const first = await listAiThreads(pagedTeam);
    const second = await listAiThreads(pagedTeam, first.next!);

    expect(first.threads.map((thread) => thread.id)).toEqual(
      expected.slice(0, 50),
    );
    expect(second.threads.map((thread) => thread.id)).toEqual(
      expected.slice(50),
    );
    expect(second.next).toBeNull();
  });
});

describe('listAiThreads access and cursor', () => {
  it("gives someone outside the team none of the team's threads, on any page", async () => {
    await thread(acme, [['Visible to the team only', 6]]);
    world.client = outsider.client;
    const anyCursor = { id: crypto.randomUUID(), lastAskedAt: hoursAgo(-1) };

    expect(await listAiThreads(teamId)).toEqual({ threads: [], next: null });
    expect(await listAiThreads(teamId, anyCursor)).toEqual({
      threads: [],
      next: null,
    });
    world.client = owner.client;
  });

  it('refuses a cursor that would widen the filter instead of reading it as a timestamp and a thread id', async () => {
    const id = crypto.randomUUID();

    await expect(
      listAiThreads(teamId, {
        id,
        lastAskedAt: `${hoursAgo(-1)}",id.not.is.null,last_asked_at.lt."${hoursAgo(-1)}`,
      }),
    ).rejects.toThrow();
    await expect(
      listAiThreads(teamId, {
        id: `${id}),id.not.is.null,and(id.eq.${id}`,
        lastAskedAt: hoursAgo(-1),
      }),
    ).rejects.toThrow();
  });
});

describe('aiThreadDeal', () => {
  it('names the deal a readable thread belongs to, and nothing for an unknown thread', async () => {
    const asked = await thread(birch, [['Who are the key staff?', 4]]);

    const otherTeams = await thread(elsewhere, [['Another team', 4]]);

    expect(await aiThreadDeal(asked, teamId)).toBe(birch);
    expect(await aiThreadDeal(crypto.randomUUID(), teamId)).toBeNull();
    expect(await aiThreadDeal('not-a-uuid', teamId)).toBeNull();
    expect(await aiThreadDeal(otherTeams, teamId)).toBeNull();
  });
});

describe('dealName', () => {
  it('names a readable deal by its business', async () => {
    expect(await dealName(acme)).toBe('Acme Plumbing');
  });
});

describe('listAskableDeals', () => {
  it("lists the team's open deals by name, and no other team's", async () => {
    const archived = await namedDeal(teamId, 'Archived Arcade');
    await dealEvent(archived, 'deal.archived', {});
    const won = await namedDeal(teamId, 'Closed Cafe');
    await dealEvent(won, 'deal.resolved', { resolution: 'won' });

    expect(await listAskableDeals(teamId)).toEqual([
      { id: acme, name: 'Acme Plumbing' },
      { id: birch, name: 'Birch Bakery' },
    ]);
  });
});

describe('loadDealAsk', () => {
  it('says whether the viewer manages the deal', async () => {
    world.client = owner.client;
    expect((await loadDealAsk(acme, teamId))!.canManage).toBe(true);

    world.client = member.client;
    expect((await loadDealAsk(acme, teamId))!.canManage).toBe(false);
    world.client = owner.client;
  });

  it('keeps a citation excerpt only for a document version the viewer can read', async () => {
    const { data: folder } = await admin
      .from('dr_folder')
      .insert({ account_id: teamId, deal_id: acme, name: 'Diligence' })
      .select('id')
      .single()
      .throwOnError();
    const cim = crypto.randomUUID();
    await admin
      .rpc('append_deal_event', {
        p_deal_id: acme,
        p_aggregate_type: 'dr_document',
        p_aggregate_id: cim,
        p_event_type: 'dr_document.added',
        p_payload: {
          folder_id: folder.id,
          name: 'cim.pdf',
          storage_path: `deal/${acme}/${cim}`,
          version: 1,
        },
        p_actor_kind: 'service',
      })
      .throwOnError();
    const cited = (documentId: string, version: number, excerpt: string) => ({
      documentId,
      documentName: 'cim.pdf',
      version,
      pageFrom: 1,
      pageTo: 1,
      excerpt,
      fromOcr: false,
    });
    const threadId = await thread(acme, [['What was revenue?', 0]]);
    await admin
      .from('deal_ai_question')
      .update({
        citations: [
          cited(cim, 1, 'Readable passage.'),
          cited(cim, 2, 'Superseded version passage.'),
          cited(crypto.randomUUID(), 1, 'Removed document passage.'),
        ],
      })
      .eq('thread_id', threadId)
      .throwOnError();

    const loaded = await loadDealAsk(acme, teamId);

    const question = loaded!.questions.find(
      (candidate) => candidate.thread_id === threadId,
    )!;
    expect(question.citations.map((citation) => citation.excerpt)).toEqual([
      'Readable passage.',
      undefined,
      undefined,
    ]);
    expect(JSON.stringify(loaded)).not.toContain('Superseded version passage');
    expect(JSON.stringify(loaded)).not.toContain('Removed document passage');
  });

  it('keeps whether each citation came from OCR', async () => {
    const cited = (fromOcr: boolean) => ({
      documentId: crypto.randomUUID(),
      documentName: 'cim.pdf',
      version: 1,
      pageFrom: 1,
      pageTo: 1,
      fromOcr,
    });
    const threadId = await thread(acme, [['Is the lease signed?', 0]]);
    await admin
      .from('deal_ai_question')
      .update({ citations: [cited(true), cited(false)] })
      .eq('thread_id', threadId)
      .throwOnError();

    const loaded = await loadDealAsk(acme, teamId);

    const question = loaded!.questions.find(
      (candidate) => candidate.thread_id === threadId,
    )!;
    expect(question.citations.map((citation) => citation.fromOcr)).toEqual([
      true,
      false,
    ]);
  });

  it("drops a stored citation that does not parse and still loads its question and the deal's other questions", async () => {
    const valid = {
      documentId: crypto.randomUUID(),
      documentName: 'cim.pdf',
      version: 1,
      pageFrom: 1,
      pageTo: 1,
      fromOcr: false,
    };
    const { fromOcr: _, ...withoutFromOcr } = valid;
    const threadId = await thread(acme, [
      ['What was margin?', 1],
      ['And churn?', 0],
    ]);
    await admin
      .from('deal_ai_question')
      .update({ citations: [valid, withoutFromOcr] })
      .eq('thread_id', threadId)
      .eq('question', 'What was margin?')
      .throwOnError();

    const loaded = await loadDealAsk(acme, teamId);

    const asked = loaded!.questions.filter(
      (candidate) => candidate.thread_id === threadId,
    );
    expect(
      asked.map(({ question, citations }) => [question, citations]),
    ).toEqual([
      ['What was margin?', [valid]],
      ['And churn?', []],
    ]);
  });

  it('loads stored document cards, keeping a note only for a document the viewer can still open', async () => {
    const { data: folder } = await admin
      .from('dr_folder')
      .insert({ account_id: teamId, deal_id: acme, name: 'Cards' })
      .select('id')
      .single()
      .throwOnError();
    const lease = crypto.randomUUID();
    await admin
      .rpc('append_deal_event', {
        p_deal_id: acme,
        p_aggregate_type: 'dr_document',
        p_aggregate_id: lease,
        p_event_type: 'dr_document.added',
        p_payload: {
          folder_id: folder.id,
          name: 'lease.pdf',
          storage_path: `deal/${acme}/${lease}`,
          version: 1,
        },
        p_actor_kind: 'service',
      })
      .throwOnError();
    const threadId = await thread(acme, [['Where are the customers?', 1]]);
    const card = (id: number, documentId: string, note: string) => ({
      id,
      kind: 'document',
      v: 1,
      documentId,
      documentName: 'lease.pdf',
      version: 1,
      page: 4,
      note,
    });
    const removed = crypto.randomUUID();
    await admin
      .from('deal_ai_question')
      .update({
        parts: [
          card(1, lease, 'The renewal clause.'),
          card(2, removed, 'Removed document note.'),
        ],
      })
      .eq('thread_id', threadId)
      .throwOnError();

    const loaded = await loadDealAsk(acme, teamId);

    expect(
      loaded!.questions.find((candidate) => candidate.thread_id === threadId)
        ?.parts,
    ).toEqual([
      card(1, lease, 'The renewal clause.'),
      {
        id: 2,
        kind: 'document',
        v: 1,
        documentId: removed,
        documentName: 'lease.pdf',
        version: 1,
        page: 4,
      },
    ]);
    expect(JSON.stringify(loaded)).not.toContain('Removed document note');
  });

  it('drops a stored part that does not parse and still loads its question, and loads an answer saved without parts with none', async () => {
    const threadId = await thread(acme, [
      ['Show revenue by year', 1],
      ['And before parts existed?', 0],
    ]);
    await admin
      .from('deal_ai_question')
      .update({
        parts: [{ id: 'part-1', kind: 'chart', v: 1, title: 'Revenue chart' }],
      })
      .eq('thread_id', threadId)
      .eq('question', 'Show revenue by year')
      .throwOnError();

    const loaded = await loadDealAsk(acme, teamId);

    const asked = loaded!.questions.filter(
      (candidate) => candidate.thread_id === threadId,
    );
    expect(asked.map(({ question, parts }) => [question, parts])).toEqual([
      ['Show revenue by year', []],
      ['And before parts existed?', []],
    ]);
    expect(JSON.stringify(loaded)).not.toContain('Revenue chart');
  });

  it("loads nothing for a deal that is not a deal id, not this team's, or not readable", async () => {
    expect(await loadDealAsk('not-a-uuid', teamId)).toBeNull();
    expect(await loadDealAsk(elsewhere, teamId)).toBeNull();

    world.client = outsider.client;
    expect(await loadDealAsk(acme, teamId)).toBeNull();
    world.client = owner.client;
  });
});

describe('teamAiConnected', () => {
  it('says whether the team has a chat provider connected', async () => {
    expect(await teamAiConnected(owner.userId, otherTeamId)).toBe(false);

    await owner.client
      .rpc('save_llm_endpoint', {
        p_account_id: otherTeamId,
        p_provider: 'openai_compatible',
        p_model: 'team-chat',
        p_base_url: 'https://provider.example.com/v1',
        p_api_key: 'sk-vault',
        p_embedding_model: 'team-embed',
        p_input_price_per_mtok: 1,
        p_cached_input_price_per_mtok: 1,
        p_output_price_per_mtok: 1,
      })
      .throwOnError();

    expect(await teamAiConnected(owner.userId, otherTeamId)).toBe(true);
  });
});
