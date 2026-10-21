import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Database } from '@odb/supabase';

const caller = vi.hoisted(() => ({
  client: null as unknown,
  admin: null as unknown,
  invites: [] as unknown[],
  undeliverable: new Set<string>(),
}));

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

vi.mock('@odb/supabase/admin', () => ({
  getSupabaseServerAdminClient: () => caller.admin,
}));

vi.mock('../../members/sign-in-link', async (original) => ({
  claimSignInLinkWindow: (
    await original<typeof import('../../members/sign-in-link')>()
  ).claimSignInLinkWindow,
  sendLenderInvite: async (_admin: unknown, invite: { email: string }) => {
    if (caller.undeliverable.has(invite.email)) {
      throw new Error('mail is down');
    }

    caller.invites.push(invite);
  },
}));

import { unwrap } from '../../actions/test-support/unwrap';
import { inviteLenderMember } from '../../members/actions';
import { createLenderRoom } from '../../rooms/actions';
import { spinUpLenderRooms } from './actions';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';

const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false },
};

const admin = createClient<Database>(
  SUPABASE_URL,
  SERVICE_ROLE_KEY,
  clientOptions,
);

const suffix = crypto.randomUUID().slice(0, 8);
const userIds: string[] = [];
const teamIds: string[] = [];
const READ_ONLY = 'This team is read-only until billing is updated.';

let ownerClient: SupabaseClient<Database>;
let teamAccountId: string;
let ownerUserId: string;

async function provisionOwner(handle = `spin-${suffix}`) {
  const email = `${handle}@odb.test`;
  const password = `Pw-${suffix}-Aa1!`;

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    throw error;
  }

  userIds.push(created.user.id);

  const client = createClient<Database>(SUPABASE_URL, ANON_KEY, clientOptions);
  const signedIn = await client.auth.signInWithPassword({ email, password });

  if (signedIn.error) {
    throw signedIn.error;
  }

  return { client, userId: created.user.id };
}

async function newDeal(accountId = teamAccountId) {
  const dealId = crypto.randomUUID();

  await admin
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: 'deal',
      p_aggregate_id: dealId,
      p_event_type: 'deal.created',
      p_payload: { account_id: accountId, description: 'Spin up deal' },
      p_actor_kind: 'service',
    })
    .throwOnError();

  return dealId;
}

async function savedLender(
  name: string,
  contact: { email: string; isPrimary: boolean } | null,
  { accountId = teamAccountId, brand = true } = {},
) {
  const domain = `${name.toLowerCase().replace(/\W/g, '')}-${suffix}.test`;

  if (brand) {
    await admin.from('lender_brand').upsert({ domain, name }).throwOnError();
  }

  const { data: lender } = await admin
    .from('lender')
    .insert({
      account_id: accountId,
      name,
      website: `https://${domain}`,
      domain,
    })
    .select('id, domain')
    .single()
    .throwOnError();

  if (contact) {
    await admin
      .from('lender_contact')
      .insert({
        account_id: accountId,
        lender_id: lender.id,
        name: `${name} Contact`,
        email: contact.email,
        is_primary: contact.isPrimary,
      })
      .throwOnError();
  }

  return lender;
}

async function newTeam(ownerUserId: string, name: string) {
  const { data: team } = await admin
    .rpc('create_team_account', {
      account_name: name,
      user_id: ownerUserId,
      account_slug: `${name.toLowerCase().replace(/\W/g, '-')}-${suffix}`,
    })
    .throwOnError();

  teamIds.push(team.id);

  return team.id;
}

async function dealRooms(dealId: string) {
  const { data } = await admin
    .from('lender_room')
    .select('id, name, brand_domain, lender_id, expires_at, private_folder_id')
    .eq('deal_id', dealId)
    .order('name')
    .throwOnError();

  return data;
}

async function roomMemberUserIds(roomId: string) {
  const { data } = await admin
    .from('lender_room_member')
    .select('user_id')
    .eq('room_id', roomId)
    .throwOnError();

  return data.map((member) => member.user_id);
}

async function roomMembers(roomId: string) {
  const { data } = await admin
    .from('lender_room_member')
    .select('email, invited_by')
    .eq('room_id', roomId)
    .throwOnError();

  return data;
}

beforeAll(async () => {
  caller.admin = admin;
  const owner = await provisionOwner();
  ownerClient = owner.client;
  caller.client = ownerClient;

  ownerUserId = owner.userId;
  teamAccountId = await newTeam(owner.userId, 'Spin Up Team');
});

afterAll(async () => {
  await admin
    .from('lender_room')
    .delete()
    .in('account_id', teamIds)
    .throwOnError();

  await admin.from('accounts').delete().in('id', teamIds);

  for (const userId of userIds) {
    await admin.auth.admin.deleteUser(userId);
  }
});

describe('spinUpLenderRooms', () => {
  it('creates a room per lender with its primary contact as a member and emails each their room sign-in link', async () => {
    const dealId = await newDeal();
    const first = await savedLender('Alpha Bank', {
      email: `alpha-${suffix}@lender.test`,
      isPrimary: true,
    });
    const second = await savedLender('Beta Bank', {
      email: `beta-${suffix}@lender.test`,
      isPrimary: true,
    });
    await admin
      .from('lender_contact')
      .insert({
        account_id: teamAccountId,
        lender_id: first.id,
        name: 'Not primary',
        email: `other-${suffix}@lender.test`,
        is_primary: false,
      })
      .throwOnError();

    const results = await unwrap(
      spinUpLenderRooms({ dealId, lenderIds: [first.id, second.id] }),
    );

    const rooms = await dealRooms(dealId);

    expect(rooms.map((room) => room.name)).toEqual(['Alpha Bank', 'Beta Bank']);
    expect(results).toEqual([
      {
        lenderId: first.id,
        roomId: rooms[0]!.id,
        status: 'created',
        emailFailed: false,
      },
      {
        lenderId: second.id,
        roomId: rooms[1]!.id,
        status: 'created',
        emailFailed: false,
      },
    ]);
    expect(rooms.map((room) => room.brand_domain)).toEqual([
      first.domain,
      second.domain,
    ]);
    expect(rooms.map((room) => room.lender_id)).toEqual([first.id, second.id]);
    expect(
      (await roomMembers(rooms[0]!.id)).map((member) => member.email),
    ).toEqual([`alpha-${suffix}@lender.test`]);
    expect(
      (await roomMembers(rooms[1]!.id)).map((member) => member.email),
    ).toEqual([`beta-${suffix}@lender.test`]);
    expect(caller.invites).toEqual([
      {
        email: `alpha-${suffix}@lender.test`,
        roomId: rooms[0]!.id,
        sentBy: ownerUserId,
      },
      {
        email: `beta-${suffix}@lender.test`,
        roomId: rooms[1]!.id,
        sentBy: ownerUserId,
      },
    ]);
    expect(
      (await roomMembers(rooms[0]!.id)).map((member) => member.invited_by),
    ).toEqual([null]);

    const { data: person } = await admin
      .from('lender_person')
      .select('name')
      .eq('user_id', (await roomMemberUserIds(rooms[0]!.id))[0]!)
      .single()
      .throwOnError();
    expect(person.name).toBe('Alpha Bank Contact');

    const expiresIn = Date.parse(rooms[0]!.expires_at!) - Date.now();
    expect(Math.abs(expiresIn - SIXTY_DAYS_MS)).toBeLessThan(60_000);
    expect(rooms[0]!.private_folder_id).toBeTruthy();
  });

  it('sets up every room when one email fails and reports which room got no email', async () => {
    const dealId = await newDeal();
    const failing = `sigma-${suffix}@lender.test`;
    const delivered = `tau-${suffix}@lender.test`;
    const first = await savedLender('Sigma Bank', {
      email: failing,
      isPrimary: true,
    });
    const second = await savedLender('Tau Bank', {
      email: delivered,
      isPrimary: true,
    });
    caller.undeliverable.add(failing);

    const results = await unwrap(
      spinUpLenderRooms({ dealId, lenderIds: [first.id, second.id] }),
    );

    const rooms = await dealRooms(dealId);
    expect(results).toEqual([
      {
        lenderId: first.id,
        roomId: rooms[0]!.id,
        status: 'created',
        emailFailed: true,
      },
      {
        lenderId: second.id,
        roomId: rooms[1]!.id,
        status: 'created',
        emailFailed: false,
      },
    ]);
    expect(
      (await roomMembers(rooms[0]!.id)).map((member) => member.email),
    ).toEqual([failing]);
    expect(caller.invites).toContainEqual({
      email: delivered,
      roomId: rooms[1]!.id,
      sentBy: ownerUserId,
    });

    caller.undeliverable.delete(failing);

    expect(
      await inviteLenderMember({ roomId: rooms[0]!.id, email: failing }),
    ).toEqual({ ok: true, value: undefined });
  });

  it('refuses a People tab resend to a primary contact within 2 minutes of spin-up', async () => {
    const dealId = await newDeal();
    const email = `rho-${suffix}@lender.test`;
    const lender = await savedLender('Rho Bank', { email, isPrimary: true });

    const [result] = await unwrap(
      spinUpLenderRooms({ dealId, lenderIds: [lender.id] }),
    );

    expect(await inviteLenderMember({ roomId: result!.roomId, email })).toEqual(
      {
        ok: false,
        refusal:
          'A sign-in link was sent to this address in the last 2 minutes. Try again shortly.',
      },
    );
  });

  it('reports a lender that already has a room on the deal with that room and creates no second one', async () => {
    const dealId = await newDeal();
    const lender = await savedLender('Gamma Bank', {
      email: `gamma-${suffix}@lender.test`,
      isPrimary: true,
    });
    const existingRoomId = await unwrap(
      createLenderRoom({
        dealId,
        name: 'Gamma by hand',
        brandDomain: lender.domain,
      }),
    );

    const results = await unwrap(
      spinUpLenderRooms({ dealId, lenderIds: [lender.id] }),
    );

    expect(results).toEqual([
      {
        lenderId: lender.id,
        roomId: existingRoomId,
        status: 'already_has_room',
        emailFailed: false,
      },
    ]);
    expect(await dealRooms(dealId)).toHaveLength(1);
    expect(
      (await roomMembers(existingRoomId)).map((member) => member.email),
    ).toEqual([`gamma-${suffix}@lender.test`]);
  });

  it('leaves an existing room that already has a member alone', async () => {
    const dealId = await newDeal();
    const lender = await savedLender('Eta Bank', {
      email: `eta-${suffix}@lender.test`,
      isPrimary: true,
    });
    const existingRoomId = await unwrap(
      createLenderRoom({ dealId, name: 'Eta', brandDomain: lender.domain }),
    );
    const { data: someone } = await admin.auth.admin.createUser({
      email: `someone-${suffix}@lender.test`,
      email_confirm: true,
    });
    userIds.push(someone.user!.id);
    await admin
      .from('lender_room_member')
      .insert({
        room_id: existingRoomId,
        user_id: someone.user!.id,
        email: `someone-${suffix}@lender.test`,
      })
      .throwOnError();

    await unwrap(spinUpLenderRooms({ dealId, lenderIds: [lender.id] }));

    expect(
      (await roomMembers(existingRoomId)).map((member) => member.email),
    ).toEqual([`someone-${suffix}@lender.test`]);
  });

  it('creates a room for a lender whose website has no cached brand, named for the saved lender', async () => {
    const dealId = await newDeal();
    const lender = await savedLender(
      'Theta Bank',
      { email: `theta-${suffix}@lender.test`, isPrimary: true },
      { brand: false },
    );

    const [result] = await unwrap(
      spinUpLenderRooms({ dealId, lenderIds: [lender.id] }),
    );

    const [room] = await dealRooms(dealId);
    expect(result).toEqual({
      lenderId: lender.id,
      roomId: room!.id,
      status: 'created',
      emailFailed: false,
    });
    expect(room!.name).toBe('Theta Bank');
    expect(room!.brand_domain).toBe(lender.domain);
  });

  it('converges when run twice', async () => {
    const dealId = await newDeal();
    const lender = await savedLender('Delta Bank', {
      email: `delta-${suffix}@lender.test`,
      isPrimary: true,
    });

    const [created] = await unwrap(
      spinUpLenderRooms({ dealId, lenderIds: [lender.id] }),
    );
    const [again] = await unwrap(
      spinUpLenderRooms({ dealId, lenderIds: [lender.id] }),
    );

    expect(again).toEqual({
      lenderId: lender.id,
      roomId: created!.roomId,
      status: 'already_has_room',
      emailFailed: false,
    });
    expect(await dealRooms(dealId)).toHaveLength(1);
  });

  it('refuses the whole call and creates nothing when a lender has no primary contact', async () => {
    const dealId = await newDeal();
    const withPrimary = await savedLender('Epsilon Bank', {
      email: `epsilon-${suffix}@lender.test`,
      isPrimary: true,
    });
    const withoutPrimary = await savedLender('Zeta Bank', {
      email: `zeta-${suffix}@lender.test`,
      isPrimary: false,
    });

    const result = await spinUpLenderRooms({
      dealId,
      lenderIds: [withPrimary.id, withoutPrimary.id],
    });

    expect(result).toEqual({
      ok: false,
      refusal:
        'Zeta Bank has no primary contact. Set one before creating a room.',
    });
    expect(await dealRooms(dealId)).toEqual([]);
  });

  it('refuses the whole call when a primary contact is already on another side of the deal', async () => {
    const dealId = await newDeal();
    const fine = await savedLender('Iota Bank', {
      email: `iota-${suffix}@lender.test`,
      isPrimary: true,
    });
    const buyerSide = await savedLender('Kappa Bank', {
      email: `spin-${suffix}@odb.test`,
      isPrimary: true,
    });

    const result = await spinUpLenderRooms({
      dealId,
      lenderIds: [fine.id, buyerSide.id],
    });

    expect(result).toEqual({
      ok: false,
      refusal: 'This person is already on another side of this deal.',
    });
    expect(await dealRooms(dealId)).toEqual([]);
  });

  it('refuses a primary contact with no email', async () => {
    const dealId = await newDeal();
    const lender = await savedLender('Lambda Bank', null);
    await admin
      .from('lender_contact')
      .insert({
        account_id: teamAccountId,
        lender_id: lender.id,
        name: 'No email',
        is_primary: true,
      })
      .throwOnError();

    const result = await spinUpLenderRooms({ dealId, lenderIds: [lender.id] });

    expect(result).toEqual({
      ok: false,
      refusal:
        'Lambda Bank has no primary contact. Set one before creating a room.',
    });
  });

  it('refuses a lender from another team the caller also belongs to', async () => {
    const dealId = await newDeal();
    const otherTeamId = await newTeam(ownerUserId, 'Second Team');
    const foreign = await savedLender(
      'Mu Bank',
      { email: `mu-${suffix}@lender.test`, isPrimary: true },
      { accountId: otherTeamId },
    );

    const result = await spinUpLenderRooms({ dealId, lenderIds: [foreign.id] });

    expect(result).toEqual({
      ok: false,
      refusal: 'A selected lender is not on this team',
    });
    expect(await dealRooms(dealId)).toEqual([]);
  });

  it('refuses someone who is not on the deal team', async () => {
    const dealId = await newDeal();
    const lender = await savedLender('Nu Bank', {
      email: `nu-${suffix}@lender.test`,
      isPrimary: true,
    });
    const stranger = await provisionOwner(`stranger-${suffix}`);
    caller.client = stranger.client;

    const result = await spinUpLenderRooms({ dealId, lenderIds: [lender.id] });
    caller.client = ownerClient;

    expect(result).toEqual({
      ok: false,
      refusal: 'Only the deal team can do that',
    });
    expect(await dealRooms(dealId)).toEqual([]);
  });

  it('refuses while the team is read-only for billing', async () => {
    const lockedTeamId = await newTeam(ownerUserId, 'Locked Team');
    await admin
      .from('accounts')
      .update({
        trial_ends_at: new Date(Date.now() - 86_400_000).toISOString(),
      })
      .eq('id', lockedTeamId)
      .throwOnError();
    const dealId = await newDeal(lockedTeamId);
    const lender = await savedLender(
      'Xi Bank',
      { email: `xi-${suffix}@lender.test`, isPrimary: true },
      { accountId: lockedTeamId },
    );

    const result = await spinUpLenderRooms({ dealId, lenderIds: [lender.id] });

    expect(result).toEqual({ ok: false, refusal: READ_ONLY });
  });
});
