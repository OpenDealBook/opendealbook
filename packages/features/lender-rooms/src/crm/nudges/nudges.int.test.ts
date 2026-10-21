import { type SupabaseClient } from '@supabase/supabase-js';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Database } from '@odb/supabase';

const caller = vi.hoisted(() => ({ client: null as unknown }));

vi.mock('@odb/next/actions', () => ({
  enhanceAction:
    (
      fn: (input: unknown, user: unknown) => unknown,
      config: { schema: { parse: (input: unknown) => unknown } },
    ) =>
    async (input: unknown) =>
      fn(
        config.schema.parse(input),
        (await (caller.client as SupabaseClient<Database>).auth.getUser()).data
          .user,
      ),
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => caller.client,
}));

import { unwrap } from '../../actions/test-support/unwrap';
import {
  type Person,
  admin,
  provisionPerson,
  removeEverythingSeeded,
  seedRoom,
  seedTeamDeal,
} from '../../asks/integration-harness';
import { setQuietDays } from './actions';
import { fetchQuietDays, listLendersToNudge } from './nudges';

const suffix = crypto.randomUUID().slice(0, 8);
const DAY = 86_400_000;

const DEAL_TEAM_ONLY = 'Only the deal team can do that';
const READ_ONLY = 'This team is read-only until billing is updated.';

let owner: Person;
let colleague: Person;
let teamId: string;
let lockedTeamId: string;
let slowTeamId: string;
let clockTeamId: string;
let clockRoom: string;
let farRoom: string;
let nearRoomA: string;
let nearRoomB: string;
let unsavedRoom: string;
let recentlyHeardRoom: string;
let slowRoom: string;
let neverSentRoom: string;
let farLenderId: string;
let nearLenderId: string;

async function newDeal(accountId: string) {
  const dealId = crypto.randomUUID();
  await admin
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: 'deal',
      p_aggregate_id: dealId,
      p_event_type: 'deal.created',
      p_payload: { account_id: accountId, description: 'Nudge deal' },
      p_actor_kind: 'service',
      p_actor_via: 'integration-test',
    })
    .throwOnError();

  return { accountId, dealId };
}

const DB_URL =
  process.env.SUPABASE_DB_URL ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function ageRoom(roomId: string, daysAgo: number) {
  const db = new pg.Client({ connectionString: DB_URL });
  await db.connect();
  try {
    await db.query('begin');
    await db.query('set local session_replication_role = replica');
    await db.query(
      'update public.lender_room set created_at = now() - make_interval(days => $2) where id = $1',
      [roomId, daysAgo],
    );
    await db.query('commit');
  } finally {
    await db.end();
  }
}

async function quietRoom(
  deal: { accountId: string; dealId: string },
  domain: string,
  daysAgo: number,
  outreach: 'sent' | 'failed' = 'sent',
) {
  const { roomId } = await seedRoom(deal, `Room ${domain}`, []);
  const { data: lender } = await admin
    .from('lender')
    .select('id')
    .eq('account_id', deal.accountId)
    .eq('domain', domain)
    .maybeSingle()
    .throwOnError();
  await admin
    .from('lender_room')
    .update({ brand_domain: domain, lender_id: lender?.id ?? null })
    .eq('id', roomId)
    .throwOnError();
  await ageRoom(roomId, daysAgo);
  await admin
    .from('lender_room_outreach')
    .insert({
      room_id: roomId,
      account_id: deal.accountId,
      sent_by: owner.userId,
      sent_at: new Date(Date.now() - daysAgo * DAY).toISOString(),
      kind: 'outreach',
      status: outreach,
      to_email: `someone@${domain}`,
      subject: 'Financing',
      body: 'Hello',
    })
    .throwOnError();

  return roomId;
}

async function newLender(accountId: string, name: string, domain: string) {
  const { data } = await admin
    .from('lender')
    .insert({ account_id: accountId, name, website: domain, domain })
    .select('id')
    .single()
    .throwOnError();

  return data.id;
}

async function newTeam(person: Person, name: string) {
  const { data: team } = await admin
    .rpc('create_team_account', {
      account_name: `${name}-${suffix}`,
      user_id: person.userId,
    })
    .throwOnError();

  return team.id;
}

const domains = {
  far: `far-${suffix}.test`,
  near: `near-${suffix}.test`,
  unsaved: `unsaved-${suffix}.test`,
  heard: `heard-${suffix}.test`,
  neverSent: `never-sent-${suffix}.test`,
  slow: `slow-${suffix}.test`,
  clock: `clock-${suffix}.test`,
};

beforeAll(async () => {
  owner = await provisionPerson();
  colleague = await provisionPerson();
  caller.client = owner.client;

  await admin
    .from('lender_brand')
    .insert(Object.values(domains).map((domain) => ({ domain })))
    .throwOnError();
  await admin
    .from('lender_brand')
    .update({ name: 'Unsaved Bank' })
    .eq('domain', domains.unsaved)
    .throwOnError();

  const first = await seedTeamDeal(owner, colleague);
  teamId = first.accountId;
  const second = await newDeal(teamId);
  const third = await newDeal(teamId);
  const fourth = await newDeal(teamId);
  const fifth = await newDeal(teamId);
  const sixth = await newDeal(teamId);

  farLenderId = await newLender(teamId, 'Far Bank', domains.far);
  nearLenderId = await newLender(teamId, 'Near Bank', domains.near);
  await newLender(teamId, 'Heard Bank', domains.heard);
  await admin
    .from('lender_contact')
    .insert([
      {
        account_id: teamId,
        lender_id: nearLenderId,
        name: 'Nora',
        email: 'nora@near.test',
        is_primary: true,
      },
      {
        account_id: teamId,
        lender_id: nearLenderId,
        name: 'Other',
        is_primary: false,
      },
    ])
    .throwOnError();

  farRoom = await quietRoom(first, domains.far, 40);
  nearRoomA = await quietRoom(second, domains.near, 30);
  nearRoomB = await quietRoom(third, domains.near, 20);
  unsavedRoom = await quietRoom(fourth, domains.unsaved, 15);
  recentlyHeardRoom = await quietRoom(fifth, domains.heard, 30);
  neverSentRoom = await quietRoom(sixth, domains.neverSent, 50, 'failed');
  await admin
    .from('lender_room_email_reply')
    .insert({
      room_id: recentlyHeardRoom,
      account_id: teamId,
      received_at: new Date(Date.now() - DAY).toISOString(),
      provider_message_id: `reply-${suffix}`,
    })
    .throwOnError();

  lockedTeamId = await newTeam(owner, 'nudge-locked');
  slowTeamId = await newTeam(owner, 'nudge-slow');
  slowRoom = await quietRoom(await newDeal(slowTeamId), domains.slow, 7);

  clockTeamId = await newTeam(owner, 'nudge-clock');
  await admin
    .from('lender_nudge_setting')
    .insert({ account_id: clockTeamId, quiet_days: 1 })
    .throwOnError();
  clockRoom = await quietRoom(await newDeal(clockTeamId), domains.clock, 0);
});

afterAll(async () => {
  await admin.from('lender').delete().eq('account_id', teamId);
  await admin.from('lender_room').delete().eq('account_id', slowTeamId);
  await admin.from('lender_room').delete().eq('account_id', clockTeamId);
  await removeEverythingSeeded();
  await admin
    .from('lender_brand')
    .delete()
    .in('domain', Object.values(domains));
});

describe('listLendersToNudge (integration)', () => {
  it('groups quiet rooms per lender, oldest due first, one entry for a lender with two quiet deals', async () => {
    const lenders = await listLendersToNudge(owner.client, teamId);

    expect(
      lenders.map((lender) => [
        lender.lenderId,
        lender.lenderName,
        lender.deals.map((deal) => deal.roomId),
      ]),
    ).toEqual([
      [farLenderId, 'Far Bank', [farRoom]],
      [nearLenderId, 'Near Bank', [nearRoomA, nearRoomB]],
      [null, 'Unsaved Bank', [unsavedRoom]],
    ]);
  });

  it("carries the lender's primary contact, or null without one", async () => {
    const [far, near] = await listLendersToNudge(owner.client, teamId);

    expect(far!.primaryContact).toBeNull();
    expect(near!.primaryContact).toEqual({
      name: 'Nora',
      email: 'nora@near.test',
    });
  });

  it('describes each quiet deal', async () => {
    const [far] = await listLendersToNudge(owner.client, teamId);

    expect(far!.deals[0]).toMatchObject({
      roomId: farRoom,
      dealName: 'Lender asks deal',
      daysSilent: 40,
    });
    expect(far!.deals[0]).not.toHaveProperty('lastHeardAt');
    expect(far!.deals[0]!.dealId).toEqual(expect.any(String));
    expect(Date.parse(far!.deals[0]!.dueSince)).toBeLessThan(Date.now());
  });

  it('leaves out a room whose lender was heard from recently', async () => {
    const lenders = await listLendersToNudge(owner.client, teamId);

    expect(
      lenders.flatMap((lender) => lender.deals.map((d) => d.roomId)),
    ).not.toContain(recentlyHeardRoom);
  });

  it('leaves out a room we have not yet sent outreach to, even when an attempt failed', async () => {
    const lenders = await listLendersToNudge(owner.client, teamId);

    expect(
      lenders.flatMap((lender) => lender.deals.map((d) => d.roomId)),
    ).not.toContain(neverSentRoom);
  });
});

describe('quiet days', () => {
  it('defaults to five and follows the team setting, which changes who is due', async () => {
    caller.client = owner.client;
    expect(await fetchQuietDays(owner.client, slowTeamId)).toBe(5);
    expect(
      (await listLendersToNudge(owner.client, slowTeamId)).flatMap((l) =>
        l.deals.map((d) => d.roomId),
      ),
    ).toEqual([slowRoom]);

    await unwrap(setQuietDays({ accountId: slowTeamId, quietDays: 10 }));

    expect(await fetchQuietDays(owner.client, slowTeamId)).toBe(10);
    expect(await listLendersToNudge(owner.client, slowTeamId)).toEqual([]);

    await unwrap(setQuietDays({ accountId: slowTeamId, quietDays: 3 }));

    expect(await fetchQuietDays(owner.client, slowTeamId)).toBe(3);
  });

  it('refuses a non-manager politely', async () => {
    caller.client = colleague.client;
    const result = await setQuietDays({ accountId: teamId, quietDays: 9 });
    caller.client = owner.client;

    expect(result).toEqual({ ok: false, refusal: DEAL_TEAM_ONLY });
    expect(await fetchQuietDays(owner.client, teamId)).toBe(5);
  });

  it('refuses a zero or fractional number of days', async () => {
    expect(
      await setQuietDays({ accountId: teamId, quietDays: 0 }),
    ).toMatchObject({ ok: false });
    expect(
      await setQuietDays({ accountId: teamId, quietDays: 1.5 }),
    ).toMatchObject({ ok: false });
  });

  it('refuses while the team is locked for billing', async () => {
    await admin
      .from('accounts')
      .update({ trial_ends_at: new Date(Date.now() - DAY).toISOString() })
      .eq('id', lockedTeamId)
      .throwOnError();

    expect(
      await setQuietDays({ accountId: lockedTeamId, quietDays: 9 }),
    ).toEqual({
      ok: false,
      refusal: READ_ONLY,
    });
  });
});

describe('E2E_CLOCK_OFFSET_HOURS', () => {
  it('counts quiet days against a clock shifted forward by the offset', async () => {
    const dueRoomIds = async () =>
      (await listLendersToNudge(owner.client, clockTeamId)).flatMap((l) =>
        l.deals.map((d) => d.roomId),
      );

    expect(await dueRoomIds()).toEqual([]);

    vi.stubEnv('E2E_CLOCK_OFFSET_HOURS', '48');
    expect(await dueRoomIds()).toEqual([clockRoom]);
    vi.unstubAllEnvs();
  });
});
