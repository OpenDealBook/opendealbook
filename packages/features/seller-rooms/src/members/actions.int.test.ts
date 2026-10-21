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

import type { Database } from '@odb/supabase';
import { turnTeamBillingOn } from '@odb/supabase/test-support/team-billing';

const SUPABASE_URL = 'http://127.0.0.1:54321';

const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON_KEY);
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY);
vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000');

interface SentEmail {
  to: string;
  from: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
}

const world = vi.hoisted(() => ({
  signedInClient: null as unknown,
  outbox: [] as SentEmail[],
  mailIsDown: false,
}));

vi.mock('@odb/mailers', () => ({
  getMailer: async () => ({
    sendEmail: async (email: SentEmail) => {
      if (world.mailIsDown) {
        throw new Error('mail is down');
      }

      world.outbox.push(email);

      return {};
    },
  }),
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => world.signedInClient,
}));

import { inviteSeller } from './actions';

interface Person {
  client: SupabaseClient<Database>;
  userId: string;
  email: string;
}

const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false },
};

const admin = createClient<Database>(
  SUPABASE_URL,
  SERVICE_ROLE_KEY,
  clientOptions,
);

const userIds: string[] = [];
let owner: Person;
let teamMember: Person;
let teamId: string;

function newEmail(): string {
  return `int-seller-${crypto.randomUUID().slice(0, 8)}@odb.test`;
}

async function provisionPerson(): Promise<Person> {
  const email = newEmail();
  const password = `Pw-${crypto.randomUUID()}-Aa1!`;

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

  return { client, userId: created.user.id, email };
}

function codeNameOf(dealId: string): string {
  return `Project ${dealId.slice(0, 8)}`;
}

async function newDeal(): Promise<string> {
  const dealId = crypto.randomUUID();
  const { data: firm } = await admin
    .from('firm')
    .insert({ account_id: teamId, name: 'Brennan Tooling' })
    .select('id')
    .single()
    .throwOnError();

  for (const [eventType, payload] of [
    [
      'deal.created',
      {
        account_id: teamId,
        owner_user_id: owner.userId,
        firm_id: firm.id,
        description: 'Founder retiring, quiet sale',
      },
    ],
    ['deal.updated', { code_name: codeNameOf(dealId) }],
  ] as const) {
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

  return dealId;
}

async function nameAs(person: Person, name: string) {
  await admin
    .from('accounts')
    .update({ name })
    .eq('primary_owner_user_id', person.userId)
    .eq('is_personal_account', true)
    .throwOnError();
}

async function roomFor(dealId: string) {
  const { data } = await admin
    .from('seller_room')
    .select('id')
    .eq('deal_id', dealId)
    .maybeSingle()
    .throwOnError();

  return data;
}

async function membersOf(roomId: string) {
  const { data } = await admin
    .from('seller_room_member')
    .select('user_id, email, name, invited_by')
    .eq('room_id', roomId)
    .throwOnError();

  return data;
}

async function usersWithEmail(email: string) {
  const { data } = await admin
    .from('accounts')
    .select('primary_owner_user_id')
    .eq('email', email)
    .eq('is_personal_account', true)
    .throwOnError();

  return data.map((row) => row.primary_owner_user_id);
}

async function makeUsers(count: number): Promise<string[]> {
  const ids: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const { data, error } = await admin.auth.admin.createUser({
      email: newEmail(),
      email_confirm: true,
    });

    if (error) {
      throw error;
    }

    ids.push(data.user.id);
  }

  userIds.push(...ids);

  return ids;
}

async function seedMembers(roomId: string, users: string[]) {
  await admin
    .from('seller_room_member')
    .insert(
      users.map((userId, index) => ({
        room_id: roomId,
        user_id: userId,
        email: `seeded-${index}-${userId.slice(0, 8)}@odb.test`,
        name: `Seeded ${index}`,
        invited_by: owner.userId,
      })),
    )
    .throwOnError();
}

async function openRoom(dealId: string): Promise<string> {
  const { data } = await owner.client
    .rpc('ensure_seller_room', { deal_id: dealId })
    .throwOnError();

  return data;
}

beforeAll(async () => {
  owner = await provisionPerson();
  teamMember = await provisionPerson();

  const { data: team } = await admin
    .rpc('create_team_account', {
      account_name: 'Acme Partners',
      user_id: owner.userId,
      account_slug: `acme-${crypto.randomUUID().slice(0, 8)}`,
    })
    .throwOnError();

  teamId = team.id;
  await nameAs(owner, 'Morgan Reyes');

  await admin
    .from('accounts_memberships')
    .insert({
      account_id: teamId,
      user_id: teamMember.userId,
      account_role: 'member',
    })
    .throwOnError();
});

beforeEach(() => {
  world.signedInClient = owner.client;
  world.outbox = [];
  world.mailIsDown = false;
  vi.stubEnv('SELLER_DELIVERY_FROM_EMAIL', 'Deals <deals@odb.test>');
});

afterAll(async () => {
  await admin.from('accounts').delete().eq('id', teamId);

  for (const id of userIds.filter(Boolean)) {
    await admin.auth.admin.deleteUser(id);
  }
});

describe('inviteSeller', () => {
  it('opens the deal room, adds the seller by name and email, and emails a sign-in link into the room', async () => {
    const dealId = await newDeal();
    const email = newEmail();

    const result = await inviteSeller({ dealId, name: 'Sam Seller', email });

    const room = await roomFor(dealId);
    const [sellerId] = await usersWithEmail(email);
    userIds.push(sellerId!);

    expect(result).toEqual({ ok: true, value: undefined });
    expect(await membersOf(room!.id)).toEqual([
      {
        user_id: sellerId,
        email,
        name: 'Sam Seller',
        invited_by: owner.userId,
      },
    ]);
    expect(world.outbox).toHaveLength(1);
    expect(world.outbox[0]!.to).toBe(email);
    expect(world.outbox[0]!.from).toBe(
      '"Morgan Reyes via Open Deal Book" <deals@odb.test>',
    );
    expect(world.outbox[0]!.replyTo).toBe(owner.email);
    expect(world.outbox[0]!.subject).toBe(
      `Morgan Reyes invited you to the room for ${codeNameOf(dealId)}`,
    );
    expect(world.outbox[0]!.text).toContain('Brennan Tooling');
    expect(
      `${world.outbox[0]!.subject}${world.outbox[0]!.text}${world.outbox[0]!.html}`,
    ).not.toContain('Founder retiring');
    expect(world.outbox[0]!.text).toContain(
      'http://localhost:3000/seller/confirm?token_hash=',
    );
    expect(world.outbox[0]!.text).toContain(
      `next=${encodeURIComponent(`/seller/rooms/${room!.id}`)}`,
    );
  });

  it('refuses a member of the deal team, and emails no one', async () => {
    const dealId = await newDeal();

    const result = await inviteSeller({
      dealId,
      email: teamMember.email,
      name: 'Tess Team',
    });

    expect(result).toEqual({
      ok: false,
      refusal: 'This person is already on another side of this deal.',
    });
    expect(world.outbox).toEqual([]);
  });

  it("refuses a lender in one of the deal's lender rooms", async () => {
    const dealId = await newDeal();
    const lender = await provisionPerson();
    const { data: folder } = await admin
      .from('dr_folder')
      .insert({ account_id: teamId, deal_id: dealId, name: 'Lender room' })
      .select('id')
      .single()
      .throwOnError();
    const { data: lenderRoom } = await admin
      .from('lender_room')
      .insert({
        account_id: teamId,
        deal_id: dealId,
        name: 'First Bank',
        private_folder_id: folder.id,
      })
      .select('id')
      .single()
      .throwOnError();
    await admin
      .from('lender_room_member')
      .insert({
        room_id: lenderRoom.id,
        user_id: lender.userId,
        email: lender.email,
      })
      .throwOnError();

    const result = await inviteSeller({
      dealId,
      email: lender.email,
      name: 'Lee Lender',
    });

    expect(result).toEqual({
      ok: false,
      refusal: 'This person is already on another side of this deal.',
    });
    expect(world.outbox).toEqual([]);
  });

  it.each([
    ['buyer', false],
    ['seller', true],
  ] as const)(
    "with %s's counsel on the deal, lets them into the seller room: %s",
    async (side, allowed) => {
      const dealId = await newDeal();
      const counsel = await provisionPerson();
      await admin
        .from('deal_counsel')
        .insert({
          account_id: teamId,
          deal_id: dealId,
          side,
          user_id: counsel.userId,
          email: counsel.email,
        })
        .throwOnError();

      const result = await inviteSeller({
        dealId,
        email: counsel.email,
        name: 'Cass Counsel',
      });

      expect(result.ok).toBe(allowed);
    },
  );

  it('reuses the login of someone who already has one', async () => {
    const dealId = await newDeal();
    const existing = await provisionPerson();

    await inviteSeller({ dealId, name: 'Known Seller', email: existing.email });

    const room = await roomFor(dealId);

    expect(await usersWithEmail(existing.email)).toEqual([existing.userId]);
    expect((await membersOf(room!.id)).map((member) => member.user_id)).toEqual(
      [existing.userId],
    );
  });

  it('refuses a second link to the same address within two minutes', async () => {
    const dealId = await newDeal();
    const email = newEmail();

    await inviteSeller({ dealId, name: 'Sam Seller', email });
    userIds.push(...(await usersWithEmail(email)));

    const again = await inviteSeller({ dealId, name: 'Sam Seller', email });

    expect(again).toEqual({
      ok: false,
      refusal:
        'A sign-in link was sent to this address in the last 2 minutes. Try again shortly.',
    });
    expect(await membersOf((await roomFor(dealId))!.id)).toHaveLength(1);
    expect(world.outbox).toHaveLength(1);
  });

  it('sends a resend as the person resending, with replies to them', async () => {
    const dealId = await newDeal();
    const email = newEmail();
    const partner = await provisionPerson();
    await admin
      .from('accounts_memberships')
      .insert({
        account_id: teamId,
        user_id: partner.userId,
        account_role: 'owner',
      })
      .throwOnError();
    await nameAs(partner, 'Pat Partner');

    await inviteSeller({ dealId, name: 'Sam Seller', email });
    userIds.push(...(await usersWithEmail(email)));
    await admin
      .from('lender_rate_limit')
      .delete()
      .eq('key', `seller-signin:${email}`)
      .throwOnError();
    world.outbox = [];
    world.signedInClient = partner.client;

    await inviteSeller({ dealId, name: 'Sam Seller', email });

    expect(world.outbox).toEqual([
      expect.objectContaining({
        from: '"Pat Partner via Open Deal Book" <deals@odb.test>',
        replyTo: partner.email,
        subject: `Pat Partner invited you to the room for ${codeNameOf(dealId)}`,
      }),
    ]);
  });

  it('refuses a team member who cannot manage the deal, and opens no room', async () => {
    const dealId = await newDeal();
    world.signedInClient = teamMember.client;

    const result = await inviteSeller({
      dealId,
      name: 'Sam Seller',
      email: newEmail(),
    });

    expect(result).toEqual({
      ok: false,
      refusal: 'You cannot invite sellers to this deal.',
    });
    expect(await roomFor(dealId)).toBeNull();
    expect(world.outbox).toEqual([]);
  });

  it('refuses when seller email is not set up, and opens no room', async () => {
    vi.stubEnv('SELLER_DELIVERY_FROM_EMAIL', undefined);
    const dealId = await newDeal();

    const result = await inviteSeller({
      dealId,
      name: 'Sam Seller',
      email: newEmail(),
    });

    expect(result).toEqual({
      ok: false,
      refusal: 'Seller email is not set up',
    });
    expect(await roomFor(dealId)).toBeNull();
  });

  it('keeps the invite and says so when the email cannot be sent', async () => {
    const dealId = await newDeal();
    const email = newEmail();
    world.mailIsDown = true;

    const result = await inviteSeller({ dealId, name: 'Sam Seller', email });
    userIds.push(...(await usersWithEmail(email)));

    expect(result).toEqual({
      ok: false,
      refusal:
        'The invite was saved but the email could not be sent. Send it again.',
    });
    expect(await membersOf((await roomFor(dealId))!.id)).toHaveLength(1);
  });

  it('refuses a locked team up front, before opening a room', async () => {
    const dealId = await newDeal();
    await turnTeamBillingOn(admin);
    await admin
      .from('accounts')
      .update({
        trial_ends_at: new Date(Date.now() - 86_400_000).toISOString(),
      })
      .eq('id', teamId)
      .throwOnError();

    try {
      const result = await inviteSeller({
        dealId,
        name: 'Sam Seller',
        email: newEmail(),
      });

      expect(result).toEqual({
        ok: false,
        refusal: 'This team is read-only until billing is updated.',
      });
      expect(await roomFor(dealId)).toBeNull();
    } finally {
      await admin
        .from('accounts')
        .update({
          trial_ends_at: new Date(Date.now() + 86_400_000).toISOString(),
        })
        .eq('id', teamId)
        .throwOnError();
    }
  });

  it('refuses a 26th person in a room', async () => {
    const dealId = await newDeal();
    const roomId = await openRoom(dealId);
    await seedMembers(roomId, await makeUsers(25));
    await admin
      .from('seller_room_member')
      .update({ invited_by: null })
      .eq('room_id', roomId)
      .throwOnError();

    const result = await inviteSeller({
      dealId,
      name: 'One Too Many',
      email: newEmail(),
    });

    expect(result).toEqual({
      ok: false,
      refusal: 'This room already has 25 people, the most it can hold.',
    });
    expect(await membersOf(roomId)).toHaveLength(25);
  });

  it('refuses a 31st new invite by the same person within 24 hours', async () => {
    const users = await makeUsers(15);
    const firstRoom = await openRoom(await newDeal());
    const secondRoom = await openRoom(await newDeal());
    await seedMembers(firstRoom, users);
    await seedMembers(secondRoom, users);
    const dealId = await newDeal();

    const result = await inviteSeller({
      dealId,
      name: 'Thirty One',
      email: newEmail(),
    });

    expect(result).toEqual({
      ok: false,
      refusal:
        'You have invited 30 people in the last 24 hours. Try again later.',
    });
  });
});
