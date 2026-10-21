import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { appendDealEvent } from '@odb/events';

import {
  type IntegrationAccount,
  provisionAccount,
} from '../../test-support/integration-harness';

import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

const holder = vi.hoisted(() => ({
  client: null as unknown,
  admin: null as unknown,
  userId: '',
}));

vi.mock('@odb/next/actions', () => ({
  enhanceAction:
    (fn: (data: unknown, user: { id: string }) => unknown) => (data: unknown) =>
      fn(data, { id: holder.userId }),
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => holder.client,
  getSupabaseServerAdminClient: () => holder.admin,
}));

import { createDealCore } from '../server/deal-actions';
import { assignTodo, createTodo } from '../server/todo-actions';
import { fetchMyTodos } from './queries';

let me: IntegrationAccount;
let mate: IntegrationAccount;
let teamA: string;
let teamB: string;
let dealA: string;

function actAs(account: IntegrationAccount) {
  holder.client = account.user;
  holder.admin = account.admin;
  holder.userId = account.userId;
}

async function newTeam(slug: string) {
  const { data: team } = await me.admin
    .rpc('create_team_account', {
      account_name: slug,
      user_id: me.userId,
      account_slug: `${slug}-${crypto.randomUUID().slice(0, 8)}`,
    })
    .throwOnError();

  return team.id;
}

async function seedTeamWork(teamId: string, label: string) {
  const dealId = await createDealCore(
    me.user as never,
    {
      account_id: teamId,
      business_name: `${label} Plumbing`,
      industry: 'Plumbing',
      description: `${label} deal`,
      source: 'manual',
      stage: 'sourcing',
    } as never,
    me.userId,
  );

  await appendDealEvent(me.user, {
    dealId,
    aggregateType: 'checklist_item',
    aggregateId: crypto.randomUUID(),
    eventType: 'checklist_item.added',
    payload: {
      title: `${label} checklist`,
      owner_user_id: me.userId,
      due_at: '2026-10-01T00:00:00Z',
    },
  });

  await me.admin
    .from('personal_todo')
    .insert({
      account_id: teamId,
      deal_id: dealId,
      user_id: me.userId,
      title: `${label} todo`,
    })
    .throwOnError();

  return dealId;
}

async function notificationsFor(account: IntegrationAccount) {
  const { data } = await account.admin
    .from('notifications')
    .select('body, deal_id, link')
    .eq('recipient_user_id', account.userId)
    .throwOnError();

  return data;
}

interface Trigger {
  name: string;
  to: { subscriberId: string };
  payload: { title: string };
}

async function withFakeNovu(run: (triggers: Trigger[]) => Promise<void>) {
  const triggers: Trigger[] = [];
  const server = createServer((request, response) => {
    let raw = '';
    request.on('data', (chunk) => (raw += chunk));
    request.on('end', () => {
      if (request.url === '/v1/events/trigger') {
        triggers.push(JSON.parse(raw) as Trigger);
      }
      response
        .writeHead(201, { 'content-type': 'application/json' })
        .end('{"data":{}}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  vi.stubEnv('NOVU_API_KEY', 'novu-key');
  vi.stubEnv(
    'NOVU_API_URL',
    `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
  );

  try {
    await run(triggers);
  } finally {
    vi.stubEnv('NOVU_API_KEY', undefined);
    vi.stubEnv('NOVU_API_URL', undefined);
    server.close();
  }
}

beforeAll(async () => {
  me = await provisionAccount();
  mate = await provisionAccount();
  teamA = await newTeam('todos-a');
  teamB = await newTeam('todos-b');
  await me.admin
    .from('accounts_memberships')
    .insert({ account_id: teamA, user_id: mate.userId, account_role: 'member' })
    .throwOnError();
  dealA = await seedTeamWork(teamA, 'A');
  await seedTeamWork(teamB, 'B');
});

afterAll(async () => {
  await me.admin.from('accounts').delete().in('id', [teamA, teamB]);
  await me.cleanup();
  await mate.cleanup();
});

describe('fetchMyTodos', () => {
  it("lists only the given team's checklist items I own and to-dos assigned to me, each with its deal name", async () => {
    const todos = await fetchMyTodos(me.user, me.userId, teamA);

    expect(
      todos.map((todo) => [todo.kind, todo.title, todo.deal?.name]),
    ).toEqual([
      ['checklist', 'A checklist', 'A Plumbing'],
      ['todo', 'A todo', 'A Plumbing'],
    ]);
  });
});

describe('adding a deal to-do', () => {
  it('stores the chosen due date as UTC midnight', async () => {
    actAs(me);
    const result = await createTodo({
      account_id: teamA,
      deal_id: dealA,
      title: 'Send the NDA',
      due_on: '2026-10-30',
      assignee_user_id: me.userId,
    });

    expect(
      new Date(
        (result as { ok: true; value: { due_at: string } }).value.due_at,
      ).toISOString(),
    ).toBe('2026-10-30T00:00:00.000Z');
  });
});

describe('assigning a deal to-do', () => {
  it('puts it in the assignee My Todos, keeps it out of mine, and notifies them about the deal', async () => {
    actAs(me);
    const result = await createTodo({
      account_id: teamA,
      deal_id: dealA,
      title: 'Pull the leases',
      assignee_user_id: mate.userId,
    });

    expect(result).toMatchObject({ ok: true });
    expect(
      (await fetchMyTodos(mate.user, mate.userId, teamA)).map((t) => t.title),
    ).toContain('Pull the leases');
    expect(
      (await fetchMyTodos(me.user, me.userId, teamA)).map((t) => t.title),
    ).not.toContain('Pull the leases');
    expect(await notificationsFor(mate)).toContainEqual(
      expect.objectContaining({
        deal_id: dealA,
        body: expect.stringContaining('Pull the leases'),
      }),
    );
  });

  it('lets the assignee hand it back, notifying the new assignee with a link to the to-do', async () => {
    actAs(me);
    const created = await createTodo({
      account_id: teamA,
      deal_id: dealA,
      title: 'Call the landlord',
      assignee_user_id: mate.userId,
    });
    const id = (created as { ok: true; value: { id: string } }).value.id;

    actAs(mate);
    expect(await assignTodo({ id, assignee_user_id: me.userId })).toEqual({
      ok: true,
      value: undefined,
    });

    expect(
      (await fetchMyTodos(me.user, me.userId, teamA)).map((t) => t.title),
    ).toContain('Call the landlord');
    expect(await notificationsFor(me)).toContainEqual(
      expect.objectContaining({
        deal_id: dealA,
        body: expect.stringContaining('Call the landlord'),
        link: expect.stringMatching(
          new RegExp(`^/home/[^/]+/deals/${dealA}/todos#todo-${id}$`),
        ),
      }),
    );
  });
});

describe('emailing an assignment', () => {
  it('asks Novu to email a teammate who is given a to-do, and nobody when I assign myself', async () => {
    await withFakeNovu(async (triggers) => {
      actAs(me);
      await createTodo({
        account_id: teamA,
        deal_id: dealA,
        title: 'Book the site visit',
        assignee_user_id: mate.userId,
      });
      await createTodo({
        account_id: teamA,
        deal_id: dealA,
        title: 'Read the CIM',
        assignee_user_id: me.userId,
      });

      expect(
        triggers.map((trigger) => [
          trigger.name,
          trigger.to.subscriberId,
          trigger.payload.title,
        ]),
      ).toEqual([['todo.assigned', mate.userId, 'Book the site visit']]);
    });
  });
});
