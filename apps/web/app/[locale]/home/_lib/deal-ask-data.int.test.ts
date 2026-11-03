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
