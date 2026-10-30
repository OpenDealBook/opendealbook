import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Database } from '@odb/supabase';

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';

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

const testWorld = vi.hoisted(() => ({
  signedInClient: null as unknown,
  outbox: [] as SentEmail[],
  mailIsDown: false,
  workAfterResponse: [] as Promise<unknown>[],
}));

vi.mock('@odb/mailers', () => ({
  getMailer: async () => ({
    sendEmail: async (email: SentEmail) => {
      if (testWorld.mailIsDown) {
        throw new Error('mail is down');
      }

      testWorld.outbox.push(email);

      return {};
    },
  }),
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => testWorld.signedInClient,
}));

vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  after: (work: () => Promise<unknown>) => {
    testWorld.workAfterResponse.push(work());
  },
}));

import { unwrap } from '../actions/test-support/unwrap';
import {
  inviteLenderMember,
  listLenderMembers,
  listRemovedLenderMembers,
  removeLenderMember,
  requestLenderRoomAccess,
  requestLenderSignInLink,
  setMyLenderName,
  skipLenderNamePrompt,
} from './actions';
import { loadClosedRoomContactEmail } from './closed-room-contact';
import { confirmSignIn } from './confirm-sign-in';
import { shouldAskLenderName, shouldAskLenderPhone } from './person-name';
import { hasLenderRooms, loadRoomGate, myOpenRoomIds } from './room-gate';
import { sendSignInLink } from './sign-in-link';

interface Person {
  client: SupabaseClient<Database>;
  userId: string;
  accountId: string;
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
let outsider: Person;
let lender: Person;
let roomId: string;

function newEmail(): string {
  return `int-${crypto.randomUUID().slice(0, 8)}@odb.test`;
}

function freshClient() {
  return createClient<Database>(SUPABASE_URL, ANON_KEY, clientOptions);
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

  const { data: account } = await admin
    .rpc('create_team_account', {
      account_name: `Int ${crypto.randomUUID().slice(0, 8)}`,
      user_id: created.user.id,
    })
    .throwOnError();

  const client = freshClient();
  const signedIn = await client.auth.signInWithPassword({ email, password });

  if (signedIn.error) {
    throw signedIn.error;
  }

  return { client, userId: created.user.id, accountId: account.id, email };
}

async function newRoom(
  roomOwner: Person = owner,
  accountId = roomOwner.accountId,
  roomCount = 1,
): Promise<string> {
  const dealId = crypto.randomUUID();
  const { data: firm } = await admin
    .from('firm')
    .insert({ account_id: accountId, name: 'Brennan Tooling' })
    .select('id')
    .single()
    .throwOnError();

  await admin
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: 'deal',
      p_aggregate_id: dealId,
      p_event_type: 'deal.created',
      p_payload: {
        account_id: accountId,
        owner_user_id: roomOwner.userId,
        firm_id: firm.id,
        description: 'Lender members deal',
      },
      p_actor_kind: 'service',
    })
    .throwOnError();

  const { data: folder } = await admin
    .from('dr_folder')
    .insert({ account_id: accountId, deal_id: dealId, name: 'Room' })
    .select('id')
    .single()
    .throwOnError();

  const { data: rooms } = await admin
    .from('lender_room')
    .insert(
      Array.from({ length: roomCount }, () => ({
        account_id: accountId,
        deal_id: dealId,
        name: 'First Bank',
        private_folder_id: folder.id,
      })),
    )
    .select('id')
    .throwOnError();

  return rooms[0]!.id;
}

async function addMember(person: Person, room = roomId): Promise<string> {
  const { data } = await admin
    .from('lender_room_member')
    .insert({ room_id: room, user_id: person.userId, email: person.email })
    .select('id')
    .single()
    .throwOnError();

  return data.id;
}

async function closeRoom(room: string) {
  await admin
    .from('lender_room')
    .update({ closed_at: new Date().toISOString() })
    .eq('id', room)
    .throwOnError();
}

async function memberRows(email: string, room = roomId) {
  const { data } = await admin
    .from('lender_room_member')
    .select('*')
    .eq('room_id', room)
    .eq('email', email)
    .throwOnError();

  return data;
}

async function usersWithEmail(email: string) {
  const { data } = await admin
    .from('accounts')
    .select('primary_owner_user_id')
    .eq('email', email)
    .throwOnError();

  return data.map((account) => account.primary_owner_user_id);
}

async function trackInvitedUser(email: string) {
  const [userId] = await usersWithEmail(email);
  userIds.push(userId!);

  return userId!;
}

function emailsSentTo(email: string) {
  return testWorld.outbox.filter((sent) => sent.to === email);
}

function linkIn(sent: SentEmail): URL {
  return new URL(sent.text.match(/https?:\/\/\S+\/auth\/confirm\S+/)![0]);
}

async function signInWith(link: URL) {
  const browser = freshClient();
  const { data } = await browser.auth.verifyOtp({
    token_hash: link.searchParams.get('token_hash')!,
    type: 'magiclink',
  });

  return { client: browser, userId: data.user?.id };
}

async function canOpenRoom(client: SupabaseClient<Database>, room = roomId) {
  const { data } = await client
    .rpc('lender_room_view', { room_id: room })
    .throwOnError();

  return data.length === 1;
}

async function letWindowPass(key: string) {
  await admin.from('lender_rate_limit').delete().eq('key', key).throwOnError();
}

async function workAfterResponse() {
  await Promise.all(testWorld.workAfterResponse.splice(0));
}

beforeAll(async () => {
  owner = await provisionPerson();
  outsider = await provisionPerson();
  lender = await provisionPerson();
  roomId = await newRoom();
  await addMember(lender);
});

afterAll(async () => {
  for (const userId of userIds) {
    await admin.auth.admin.deleteUser(userId);
  }

  await admin
    .from('lender_rate_limit')
    .delete()
    .like('key', 'signin:int-%@odb.test')
    .throwOnError();
});

describe('inviteLenderMember (integration)', () => {
  it('emails a newly invited person our own link, which signs a fresh browser into the room', async () => {
    const email = newEmail();
    testWorld.signedInClient = owner.client;

    await unwrap(inviteLenderMember({ roomId, email }));

    const invitedUserId = await trackInvitedUser(email);
    const sent = emailsSentTo(email);
    expect(sent).toHaveLength(1);

    const link = linkIn(sent[0]!);
    expect(link.origin + link.pathname).toBe(
      'http://localhost:3000/auth/confirm',
    );
    expect(link.searchParams.get('next')).toBe(`/lender/${roomId}`);

    const invitee = await signInWith(link);
    expect(invitee.userId).toBe(invitedUserId);
    expect(await canOpenRoom(invitee.client)).toBe(true);
  });

  it('sends the invite as the inviter, under the outside name, with the loan summary', async () => {
    const email = newEmail();
    const room = await newRoom();
    const { data: dealRow } = await admin
      .from('lender_room')
      .select('deal_id, account_id')
      .eq('id', room)
      .single()
      .throwOnError();
    await admin
      .rpc('append_deal_event', {
        p_deal_id: dealRow.deal_id,
        p_aggregate_type: 'deal',
        p_aggregate_id: dealRow.deal_id,
        p_event_type: 'deal.updated',
        p_payload: { code_name: `Project ${room.slice(0, 8)}` },
        p_actor_kind: 'service',
      })
      .throwOnError();
    await admin
      .from('deal_terms_sought')
      .insert({
        account_id: dealRow.account_id,
        deal_id: dealRow.deal_id,
        loan_amount: 1200000,
        loan_type: 'sba_7a',
        term_years: 10,
      })
      .throwOnError();
    await admin
      .rpc('append_deal_event', {
        p_deal_id: dealRow.deal_id,
        p_aggregate_type: 'deal',
        p_aggregate_id: dealRow.deal_id,
        p_event_type: 'deal.close_deadline_set',
        p_payload: { must_close_by: '2026-12-01' },
        p_actor_kind: 'service',
      })
      .throwOnError();
    await admin
      .from('accounts')
      .update({ name: 'Morgan Reyes' })
      .eq('primary_owner_user_id', owner.userId)
      .eq('is_personal_account', true)
      .throwOnError();
    const { data: team } = await admin
      .from('accounts')
      .select('name')
      .eq('id', owner.accountId)
      .single()
      .throwOnError();
    testWorld.signedInClient = owner.client;

    await unwrap(inviteLenderMember({ roomId: room, email }));
    await trackInvitedUser(email);

    const [sent] = emailsSentTo(email);
    expect(sent).toMatchObject({
      from: '"Morgan Reyes via Open Deal Book" <hello@opendealbook.app>',
      replyTo: owner.email,
      subject: `Morgan Reyes at ${team.name} invited you to review a loan request for Project ${room.slice(0, 8)}`,
    });
    expect(sent!.text).toContain(`Borrower: ${team.name}`);
    expect(sent!.text).toContain(`Business: Project ${room.slice(0, 8)}`);
    expect(sent!.text).toContain('Loan ask: $1,200,000 SBA 7(a), 10-year term');
    expect(sent!.text).toContain('Close by: December 1, 2026');
    expect(`${sent!.subject}${sent!.text}${sent!.html}`).not.toMatch(
      /Lender members deal|Brennan Tooling/,
    );
  });

  it('records who invited the person', async () => {
    const email = newEmail();
    testWorld.signedInClient = owner.client;

    await unwrap(inviteLenderMember({ roomId, email }));
    await trackInvitedUser(email);

    expect(await memberRows(email)).toMatchObject([
      { invited_by: owner.userId },
    ]);
  });

  it('lets an existing Open Deal Book user into the room under their own account, whatever the letter case of the email', async () => {
    const existing = await provisionPerson();
    testWorld.signedInClient = owner.client;

    await unwrap(
      inviteLenderMember({ roomId, email: existing.email.toUpperCase() }),
    );

    expect(await canOpenRoom(existing.client)).toBe(true);
  });

  it('refuses to send a second link to someone invited in the last two minutes', async () => {
    const email = newEmail();
    testWorld.signedInClient = owner.client;
    await unwrap(inviteLenderMember({ roomId, email }));
    await trackInvitedUser(email);

    await expect(unwrap(inviteLenderMember({ roomId, email }))).rejects.toThrow(
      'A sign-in link was sent to this address in the last 2 minutes. Try again shortly.',
    );

    expect(emailsSentTo(email)).toHaveLength(1);
  });

  it('sends someone already in the room a fresh link once two minutes have passed, and they stay in the room once', async () => {
    const email = newEmail();
    testWorld.signedInClient = owner.client;
    await unwrap(inviteLenderMember({ roomId, email }));
    await trackInvitedUser(email);
    await letWindowPass(`signin:${email}`);

    await unwrap(inviteLenderMember({ roomId, email }));

    expect(emailsSentTo(email)).toHaveLength(2);
    expect(await memberRows(email)).toHaveLength(1);
  });

  it.each([
    ['a lender in the room', () => lender],
    ['an unrelated account owner', () => outsider],
  ])(
    'refuses %s, and the address they named gets no account and no email',
    async (_label, caller) => {
      const email = newEmail();
      testWorld.signedInClient = caller().client;

      await expect(
        unwrap(inviteLenderMember({ roomId, email })),
      ).rejects.toThrow('You cannot invite people to this room');

      expect(await usersWithEmail(email)).toEqual([]);
      expect(emailsSentTo(email)).toEqual([]);
    },
  );

  it('ends two simultaneous invites of one new address with one user who is in the room once', async () => {
    const email = newEmail();
    testWorld.signedInClient = owner.client;

    await Promise.all([
      unwrap(inviteLenderMember({ roomId, email })),
      unwrap(inviteLenderMember({ roomId, email })),
    ]);

    const users = await usersWithEmail(email);
    userIds.push(...users);
    expect(users).toHaveLength(1);
    expect(await memberRows(email)).toHaveLength(1);
  });

  it('keeps the person in the room and says to send again when the email cannot be sent', async () => {
    const email = newEmail();
    testWorld.signedInClient = owner.client;
    testWorld.mailIsDown = true;

    await expect(unwrap(inviteLenderMember({ roomId, email })))
      .rejects.toThrow(
        'The invite was saved but the email could not be sent. Send it again.',
      )
      .finally(() => {
        testWorld.mailIsDown = false;
      });

    await trackInvitedUser(email);
    expect(await memberRows(email)).toHaveLength(1);
  });

  it('refuses a 26th person in a room', async () => {
    const fullRoomId = await newRoom();
    const people = await Promise.all(
      Array.from({ length: 25 }, () => provisionPerson()),
    );
    await admin
      .from('lender_room_member')
      .insert(
        people.map((person) => ({
          room_id: fullRoomId,
          user_id: person.userId,
          email: person.email,
        })),
      )
      .throwOnError();
    const email = newEmail();
    testWorld.signedInClient = owner.client;

    await expect(
      unwrap(inviteLenderMember({ roomId: fullRoomId, email })),
    ).rejects.toThrow('This room already has 25 people, the most it can hold.');

    expect(await usersWithEmail(email)).toEqual([]);
  });

  describe('for an inviter who has added 30 people in the last 24 hours', () => {
    let busyInviter: Person;
    let busyRoomIds: string[];

    beforeAll(async () => {
      busyInviter = await provisionPerson();
      await newRoom(busyInviter, busyInviter.accountId, 30);

      const { data: rooms } = await admin
        .from('lender_room')
        .select('id')
        .eq('account_id', busyInviter.accountId)
        .throwOnError();
      busyRoomIds = rooms.map((room) => room.id);

      await admin
        .from('lender_room_member')
        .insert(
          busyRoomIds.map((room) => ({
            room_id: room,
            user_id: lender.userId,
            email: lender.email,
            invited_by: busyInviter.userId,
          })),
        )
        .throwOnError();
    });

    it('refuses a 31st', async () => {
      const email = newEmail();
      testWorld.signedInClient = busyInviter.client;

      await expect(
        unwrap(inviteLenderMember({ roomId: busyRoomIds[0]!, email })),
      ).rejects.toThrow(
        'You have invited 30 people in the last 24 hours. Try again later.',
      );

      expect(await usersWithEmail(email)).toEqual([]);
    });

    it('allows another once one of those invitations is more than 24 hours old', async () => {
      await admin
        .from('lender_room_member')
        .update({
          created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
        })
        .eq('room_id', busyRoomIds[1]!)
        .throwOnError();
      const email = newEmail();
      testWorld.signedInClient = busyInviter.client;

      await unwrap(inviteLenderMember({ roomId: busyRoomIds[0]!, email }));

      await trackInvitedUser(email);
      expect(emailsSentTo(email)).toHaveLength(1);
    });
  });
});

describe('inviteLenderMember across sides (integration)', () => {
  let sideRoomId: string;
  let dealId: string;

  async function onDeal(
    person: Person,
    side: 'seller' | 'buyer counsel' | 'seller counsel',
  ) {
    if (side === 'seller') {
      const { data: sellerRoomId } = await owner.client
        .rpc('ensure_seller_room', { deal_id: dealId })
        .throwOnError();
      await admin
        .from('seller_room_member')
        .insert({
          room_id: sellerRoomId,
          user_id: person.userId,
          email: person.email,
          name: 'Sam Seller',
        })
        .throwOnError();

      return;
    }

    await admin
      .from('deal_counsel')
      .insert({
        account_id: owner.accountId,
        deal_id: dealId,
        side: side === 'buyer counsel' ? 'buyer' : 'seller',
        user_id: person.userId,
        email: person.email,
      })
      .throwOnError();
  }

  beforeAll(async () => {
    sideRoomId = await newRoom();
    const { data } = await admin
      .from('lender_room')
      .select('deal_id')
      .eq('id', sideRoomId)
      .single()
      .throwOnError();
    dealId = data.deal_id;
  });

  it('refuses a member of the deal team, and adds and emails no one', async () => {
    testWorld.signedInClient = owner.client;
    testWorld.outbox = [];

    const result = await inviteLenderMember({
      roomId: sideRoomId,
      email: owner.email,
    });

    expect(result).toEqual({
      ok: false,
      refusal: 'This person is already on another side of this deal.',
    });
    expect(await memberRows(owner.email, sideRoomId)).toEqual([]);
    expect(emailsSentTo(owner.email)).toEqual([]);
  });

  it.each(['seller', 'buyer counsel', 'seller counsel'] as const)(
    'refuses someone who is the %s on the deal',
    async (side) => {
      const person = await provisionPerson();
      await onDeal(person, side);
      testWorld.signedInClient = owner.client;

      const result = await inviteLenderMember({
        roomId: sideRoomId,
        email: person.email,
      });

      expect(result).toEqual({
        ok: false,
        refusal: 'This person is already on another side of this deal.',
      });
      expect(await memberRows(person.email, sideRoomId)).toEqual([]);
    },
  );
});

describe('removeLenderMember (integration)', () => {
  it('stops the removed person opening the room at once', async () => {
    const leaving = await provisionPerson();
    const memberId = await addMember(leaving);
    testWorld.signedInClient = owner.client;

    await unwrap(removeLenderMember({ memberId }));

    expect(await canOpenRoom(leaving.client)).toBe(false);
  });

  it('leaves the removed person their user account', async () => {
    const leaving = await provisionPerson();
    const memberId = await addMember(leaving);
    testWorld.signedInClient = owner.client;

    await unwrap(removeLenderMember({ memberId }));

    const { data: kept } = await admin.auth.admin.getUserById(leaving.userId);
    expect(kept.user?.id).toBe(leaving.userId);
  });

  it.each([
    ['a lender in the room', () => lender],
    ['an unrelated account owner', () => outsider],
  ])(
    'tells %s the person is not in this room, and the person stays',
    async (_label, caller) => {
      const staying = await provisionPerson();
      const memberId = await addMember(staying);
      testWorld.signedInClient = caller().client;

      await expect(unwrap(removeLenderMember({ memberId }))).rejects.toThrow(
        'That person is not in this room',
      );

      expect(await canOpenRoom(staying.client)).toBe(true);
    },
  );
});

describe('listLenderMembers (integration)', () => {
  it('lists the people in the room to our team, oldest first', async () => {
    const listedRoomId = await newRoom();
    const [newer, older] = [await provisionPerson(), await provisionPerson()];
    await admin
      .from('lender_room_member')
      .insert([
        {
          room_id: listedRoomId,
          user_id: newer.userId,
          email: newer.email,
          created_at: '2026-02-01T00:00:00Z',
        },
        {
          room_id: listedRoomId,
          user_id: older.userId,
          email: older.email,
          created_at: '2026-01-01T00:00:00Z',
        },
      ])
      .throwOnError();
    testWorld.signedInClient = owner.client;

    const members = await unwrap(listLenderMembers({ roomId: listedRoomId }));

    expect(members.map((member) => member.email)).toEqual([
      older.email,
      newer.email,
    ]);
  });

  it('lists nobody to an unrelated account owner', async () => {
    testWorld.signedInClient = outsider.client;

    expect(await unwrap(listLenderMembers({ roomId }))).toEqual([]);
  });
});

describe('listRemovedLenderMembers (integration)', () => {
  async function removalRows(person: Person, room: string) {
    const { data } = await admin
      .from('lender_room_removed_member')
      .select('removed_at, invited_at')
      .eq('room_id', room)
      .eq('user_id', person.userId)
      .order('removed_at', { ascending: true })
      .throwOnError();

    return data;
  }

  async function removeAsOwner(person: Person, room: string) {
    const memberId = await addMember(person, room);
    testWorld.signedInClient = owner.client;
    await unwrap(removeLenderMember({ memberId }));
  }

  async function listAsOwner(room: string) {
    testWorld.signedInClient = owner.client;

    return unwrap(listRemovedLenderMembers({ roomId: room }));
  }

  it('shows the deal team a removed person with their email and when they were invited and removed', async () => {
    const room = await newRoom();
    const removed = await provisionPerson();
    await removeAsOwner(removed, room);
    const [removal] = await removalRows(removed, room);

    expect(await listAsOwner(room)).toEqual([
      {
        userId: removed.userId,
        email: removed.email,
        name: null,
        invitedAt: removal!.invited_at,
        removedAt: removal!.removed_at,
      },
    ]);
  });

  it("ends the removed person's access at once and records the removal exactly once", async () => {
    const room = await newRoom();
    const removed = await provisionPerson();

    await removeAsOwner(removed, room);

    expect(await canOpenRoom(removed.client, room)).toBe(false);
    expect(await removalRows(removed, room)).toHaveLength(1);
  });

  it('does not show someone who was removed and then invited again', async () => {
    const room = await newRoom();
    const returning = await provisionPerson();
    await removeAsOwner(returning, room);
    await addMember(returning, room);

    expect(await listAsOwner(room)).toEqual([]);
  });

  it('shows someone removed twice once, with the latest removal', async () => {
    const room = await newRoom();
    const removedTwice = await provisionPerson();
    await removeAsOwner(removedTwice, room);
    await removeAsOwner(removedTwice, room);
    const [, latest] = await removalRows(removedTwice, room);

    expect(await listAsOwner(room)).toMatchObject([
      { userId: removedTwice.userId, removedAt: latest!.removed_at },
    ]);
  });

  it('refuses a lender in the room', async () => {
    testWorld.signedInClient = lender.client;

    await expect(unwrap(listRemovedLenderMembers({ roomId }))).rejects.toThrow(
      'Only the deal team can do that',
    );
  });

  it('leaves out people removed from another room', async () => {
    const room = await newRoom();
    const otherRoom = await newRoom();
    await removeAsOwner(await provisionPerson(), otherRoom);

    expect(await listAsOwner(room)).toEqual([]);
  });
});

describe('lender names (integration)', () => {
  async function nameOf(userId: string) {
    const { data } = await admin
      .from('lender_person')
      .select('name')
      .eq('user_id', userId)
      .maybeSingle()
      .throwOnError();

    return data?.name ?? null;
  }

  async function inviteAsOwner(email: string, name?: string) {
    testWorld.signedInClient = owner.client;
    await unwrap(inviteLenderMember({ roomId, email, name }));
  }

  async function signedInAs(email: string) {
    const userId = await trackInvitedUser(email);
    const { data: link } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    const browser = freshClient();
    await browser.auth.verifyOtp({
      token_hash: link.properties!.hashed_token,
      type: 'magiclink',
    });

    return { userId, client: browser };
  }

  it('gives a newly invited person the name the deal team typed, trimmed', async () => {
    const email = newEmail();

    await inviteAsOwner(email, '  Dana Lee  ');

    expect(await nameOf(await trackInvitedUser(email))).toBe('Dana Lee');
  });

  it('leaves a person with no name when the deal team leaves the name blank', async () => {
    const email = newEmail();

    await inviteAsOwner(email, '   ');

    expect(await nameOf(await trackInvitedUser(email))).toBeNull();
  });

  it('keeps the name a person already has when an invite names them differently', async () => {
    const named = await provisionPerson();
    await admin
      .from('lender_person')
      .insert({ user_id: named.userId, name: 'Their Own Name' })
      .throwOnError();

    await inviteAsOwner(named.email, 'Invite Name');

    expect(await nameOf(named.userId)).toBe('Their Own Name');
  });

  it('asks a person with no name for it on entering', async () => {
    const email = newEmail();
    await inviteAsOwner(email);
    const person = await signedInAs(email);

    expect(await shouldAskLenderName(person.client)).toBe(true);
  });

  it('does not ask a person the deal team named', async () => {
    const email = newEmail();
    await inviteAsOwner(email, 'Dana Lee');
    const person = await signedInAs(email);

    expect(await shouldAskLenderName(person.client)).toBe(false);
  });

  it('saves the name a person gives and stops asking', async () => {
    const email = newEmail();
    await inviteAsOwner(email);
    const person = await signedInAs(email);
    testWorld.signedInClient = person.client;

    await unwrap(setMyLenderName({ name: ' Sam Ortiz ' }));

    expect(await nameOf(person.userId)).toBe('Sam Ortiz');
    expect(await shouldAskLenderName(person.client)).toBe(false);
  });

  it('lets a person replace the name the deal team typed with their own', async () => {
    const email = newEmail();
    await inviteAsOwner(email, 'Dana Lee');
    const person = await signedInAs(email);
    testWorld.signedInClient = person.client;

    await unwrap(setMyLenderName({ name: 'Danielle Lee' }));

    expect(await nameOf(person.userId)).toBe('Danielle Lee');
  });

  it('asks a new lender for name and phone together, then neither again', async () => {
    const email = newEmail();
    await inviteAsOwner(email);
    const person = await signedInAs(email);
    testWorld.signedInClient = person.client;

    expect(await shouldAskLenderPhone(person.client)).toBe(false);

    await unwrap(
      setMyLenderName({ name: 'Sam Ortiz', phone: ' +1 555 0100 ' }),
    );

    const { data: account } = await admin
      .from('accounts')
      .select('phone, phone_asked_at')
      .eq('id', person.userId)
      .single()
      .throwOnError();
    expect(account.phone).toBe('+1 555 0100');
    expect(account.phone_asked_at).not.toBeNull();
    expect(await shouldAskLenderPhone(person.client)).toBe(false);
  });

  it('asks a lender the team already named for a phone, once', async () => {
    const email = newEmail();
    await inviteAsOwner(email, 'Dana Lee');
    const person = await signedInAs(email);

    expect(await shouldAskLenderPhone(person.client)).toBe(true);

    await admin
      .from('accounts')
      .update({ phone_asked_at: new Date().toISOString() })
      .eq('id', person.userId)
      .throwOnError();

    expect(await shouldAskLenderPhone(person.client)).toBe(false);
  });

  it('skipping the first prompt skips the phone too', async () => {
    const email = newEmail();
    await inviteAsOwner(email);
    const person = await signedInAs(email);
    testWorld.signedInClient = person.client;

    await unwrap(skipLenderNamePrompt({}));

    expect(await shouldAskLenderPhone(person.client)).toBe(false);
  });

  it('never asks again after a person skips, and leaves them unnamed', async () => {
    const email = newEmail();
    await inviteAsOwner(email);
    const person = await signedInAs(email);
    testWorld.signedInClient = person.client;

    await unwrap(skipLenderNamePrompt({}));

    expect(await shouldAskLenderName(person.client)).toBe(false);
    expect(await nameOf(person.userId)).toBeNull();
  });

  it("shows the deal team each member's name, or null when none was given", async () => {
    const listedRoomId = await newRoom();
    const [named, unnamed] = [await provisionPerson(), await provisionPerson()];
    await addMember(named, listedRoomId);
    await addMember(unnamed, listedRoomId);
    await admin
      .from('lender_person')
      .insert({ user_id: named.userId, name: 'Named Person' })
      .throwOnError();
    testWorld.signedInClient = owner.client;

    const members = await unwrap(listLenderMembers({ roomId: listedRoomId }));

    expect(
      members.map((member) => ({ email: member.email, name: member.name })),
    ).toEqual(
      expect.arrayContaining([
        { email: named.email, name: 'Named Person' },
        { email: unnamed.email, name: null },
      ]),
    );
  });

  it("shows a lender their colleague's name", async () => {
    const listedRoomId = await newRoom();
    const [me, colleague] = [await provisionPerson(), await provisionPerson()];
    await addMember(me, listedRoomId);
    await addMember(colleague, listedRoomId);
    await admin
      .from('lender_person')
      .insert({ user_id: colleague.userId, name: 'Colleague Name' })
      .throwOnError();
    testWorld.signedInClient = me.client;

    const members = await unwrap(listLenderMembers({ roomId: listedRoomId }));

    expect(
      members.find((member) => member.email === colleague.email)?.name,
    ).toBe('Colleague Name');
  });

  it("shows the deal team a removed person's name", async () => {
    const listedRoomId = await newRoom();
    const removed = await provisionPerson();
    await admin
      .from('lender_person')
      .insert({ user_id: removed.userId, name: 'Removed Person' })
      .throwOnError();
    const memberId = await addMember(removed, listedRoomId);
    testWorld.signedInClient = owner.client;
    await unwrap(removeLenderMember({ memberId }));

    expect(
      await unwrap(listRemovedLenderMembers({ roomId: listedRoomId })),
    ).toMatchObject([{ userId: removed.userId, name: 'Removed Person' }]);
  });
});

describe('signed-in marks on room members (integration)', () => {
  async function memberSeenBy(viewer: Person, email: string, room = roomId) {
    testWorld.signedInClient = viewer.client;
    const members = await unwrap(listLenderMembers({ roomId: room }));

    return members.find((member) => member.email === email);
  }

  it('marks an invited person who has never signed in', async () => {
    const email = newEmail();
    testWorld.signedInClient = owner.client;
    await unwrap(inviteLenderMember({ roomId, email }));
    await trackInvitedUser(email);

    expect((await memberSeenBy(owner, email))?.has_signed_in).toBe(false);
  });

  it('marks an invited person as signed in once they have signed in', async () => {
    const email = newEmail();
    testWorld.signedInClient = owner.client;
    await unwrap(inviteLenderMember({ roomId, email }));
    await trackInvitedUser(email);
    const { data: link } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    await freshClient().auth.verifyOtp({
      token_hash: link.properties!.hashed_token,
      type: 'magiclink',
    });

    expect((await memberSeenBy(owner, email))?.has_signed_in).toBe(true);
  });

  it('gives a lender the same mark for a colleague', async () => {
    const listedRoomId = await newRoom();
    const [me, colleague] = [await provisionPerson(), await provisionPerson()];
    await addMember(me, listedRoomId);
    await addMember(colleague, listedRoomId);

    expect(
      (await memberSeenBy(me, colleague.email, listedRoomId))?.has_signed_in,
    ).toBe(true);
  });
});

describe('myOpenRoomIds (integration)', () => {
  it("lists the person's open rooms and leaves out closed ones", async () => {
    const person = await provisionPerson();
    const [openRoomId, closedRoomId] = [await newRoom(), await newRoom()];
    await addMember(person, openRoomId);
    await addMember(person, closedRoomId);
    await closeRoom(closedRoomId);

    expect(await myOpenRoomIds(person.client)).toEqual([openRoomId]);
  });
});

describe('loadClosedRoomContactEmail (integration)', () => {
  it("returns the contact email from the room account's current buyer profile", async () => {
    await admin
      .from('buyer_profile')
      .insert([
        {
          account_id: owner.accountId,
          version: 1,
          contact_json: { email: 'old@buyer.test' },
        },
        {
          account_id: owner.accountId,
          version: 2,
          contact_json: { email: 'deals@buyer.test' },
        },
      ])
      .throwOnError();

    expect(await loadClosedRoomContactEmail(admin, roomId)).toBe(
      'deals@buyer.test',
    );
  });

  it("returns the primary owner's email when the account has no buyer profile", async () => {
    const otherOwner = await provisionPerson();
    const otherRoomId = await newRoom(otherOwner);

    expect(await loadClosedRoomContactEmail(admin, otherRoomId)).toBe(
      otherOwner.email,
    );
  });

  it("returns the primary owner's email when the buyer profile has no contact email", async () => {
    const otherOwner = await provisionPerson();
    const otherRoomId = await newRoom(otherOwner);
    await admin
      .from('buyer_profile')
      .insert({
        account_id: otherOwner.accountId,
        version: 1,
        contact_json: { email: '', phone: '555-0100', website: '' },
      })
      .throwOnError();

    expect(await loadClosedRoomContactEmail(admin, otherRoomId)).toBe(
      otherOwner.email,
    );
  });

  it('fails loudly when there is no buyer profile email and the owner has no email', async () => {
    const { data: created, error } = await admin.auth.admin.createUser({
      phone: `+1555${Math.floor(1_000_000 + Math.random() * 8_999_999)}`,
      phone_confirm: true,
    });

    if (error) {
      throw error;
    }

    userIds.push(created.user.id);

    const { data: account } = await admin
      .rpc('create_team_account', {
        account_name: `Int ${crypto.randomUUID().slice(0, 8)}`,
        user_id: created.user.id,
      })
      .throwOnError();
    const ownerlessRoomId = await newRoom(
      { ...owner, userId: created.user.id },
      account.id,
    );

    await expect(
      loadClosedRoomContactEmail(admin, ownerlessRoomId),
    ).rejects.toThrow('has no contact email');
  });
});

describe('requestLenderSignInLink (integration)', () => {
  async function request(email: string, next = `/lender/${roomId}`) {
    const answer = await unwrap(requestLenderSignInLink({ email, next }));
    await workAfterResponse();

    return answer;
  }

  it('answers an unknown address the same way, sends nothing, and creates no user', async () => {
    const email = newEmail();

    expect(await request(email)).toBeUndefined();

    expect(emailsSentTo(email)).toEqual([]);
    expect(await usersWithEmail(email)).toEqual([]);
  });

  it('answers a known user who is in no room the same way and sends nothing', async () => {
    const roomless = await provisionPerson();

    expect(await request(roomless.email)).toBeUndefined();

    expect(emailsSentTo(roomless.email)).toEqual([]);
  });

  it('emails a room member a link that signs them in and returns to the page they came from', async () => {
    const member = await provisionPerson();
    await addMember(member);

    expect(await request(member.email.toUpperCase())).toBeUndefined();

    const sent = emailsSentTo(member.email);
    expect(sent).toHaveLength(1);

    const link = linkIn(sent[0]!);
    expect(link.searchParams.get('next')).toBe(`/lender/${roomId}`);
    expect((await signInWith(link)).userId).toBe(member.userId);
  });

  it('answers a second request inside two minutes the same way and sends no second email', async () => {
    const member = await provisionPerson();
    await addMember(member);
    await request(member.email);

    expect(await request(member.email)).toBeUndefined();

    expect(emailsSentTo(member.email)).toHaveLength(1);
  });

  it('answers the same way when the email cannot be sent', async () => {
    const member = await provisionPerson();
    await addMember(member);
    testWorld.mailIsDown = true;

    const answer = await request(member.email).finally(() => {
      testWorld.mailIsDown = false;
    });

    expect(answer).toBeUndefined();
  });

  it.each([
    ['another site', 'https://evil.example/lender'],
    ['a second redirect', '/auth/callback?next=https://evil.com'],
    ['a tab before a host', '/\t/evil.com'],
  ])(
    'puts the rooms list in the emailed link when asked to return to %s',
    async (_label, next) => {
      const member = await provisionPerson();
      await addMember(member);

      await request(member.email, next);

      const [sent] = emailsSentTo(member.email);
      expect(linkIn(sent!).searchParams.get('next')).toBe('/lender');
    },
  );
});

describe('sendSignInLink (integration)', () => {
  it('fails loudly when the site URL is not configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');

    await expect(
      sendSignInLink(admin, { email: lender.email, next: '/lender' }),
    )
      .rejects.toThrow('NEXT_PUBLIC_SITE_URL')
      .finally(() => {
        vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000');
      });
  });
});

describe('confirmSignIn (integration)', () => {
  async function tokenFor(person: Person) {
    const { data } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: person.email,
    });

    return data.properties!.hashed_token;
  }

  it('signs the browser in and returns the room path the link carried', async () => {
    const browser = freshClient();

    expect(
      await confirmSignIn(browser, {
        tokenHash: await tokenFor(lender),
        next: `/lender/${roomId}`,
      }),
    ).toEqual({ kind: 'signed-in', next: `/lender/${roomId}` });

    expect(await canOpenRoom(browser)).toBe(true);
  });

  it('returns to the rooms list when the link carried a path that is not ours', async () => {
    expect(
      await confirmSignIn(freshClient(), {
        tokenHash: await tokenFor(lender),
        next: '/auth/callback?next=https://evil.com',
      }),
    ).toEqual({ kind: 'signed-in', next: '/lender' });
  });

  it('says the link has expired when it was already used', async () => {
    const tokenHash = await tokenFor(lender);
    await confirmSignIn(freshClient(), { tokenHash, next: '/lender' });

    expect(
      await confirmSignIn(freshClient(), { tokenHash, next: '/lender' }),
    ).toEqual({ kind: 'expired' });
  });

  it('says the link has expired when the token is forged, and signs nobody in', async () => {
    const browser = freshClient();

    expect(
      await confirmSignIn(browser, { tokenHash: 'forged', next: '/lender' }),
    ).toEqual({ kind: 'expired' });

    expect((await browser.auth.getSession()).data.session).toBeNull();
  });
});

describe('loadRoomGate (integration)', () => {
  it('sends a visitor with no session to sign-in with the room as the return path', async () => {
    expect(await loadRoomGate(freshClient(), roomId)).toEqual({
      kind: 'sign-in',
      path: `/lender/sign-in?next=/lender/${roomId}`,
    });
  });

  it('fails instead of treating the visitor as signed out when the auth service errors', async () => {
    let authIsDown = false;
    const client = createClient<Database>(SUPABASE_URL, ANON_KEY, {
      ...clientOptions,
      global: {
        fetch: (input, init) =>
          authIsDown
            ? Promise.reject(new Error('auth is down'))
            : fetch(input, init),
      },
    });
    const { data: link } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: lender.email,
    });
    await client.auth.verifyOtp({
      token_hash: link.properties!.hashed_token,
      type: 'magiclink',
    });
    authIsDown = true;

    await expect(loadRoomGate(client, roomId)).rejects.toThrow();
  });

  it('fails instead of treating the visitor as signed out when the auth service answers with a server error', async () => {
    let authIsBroken = false;
    const client = createClient<Database>(SUPABASE_URL, ANON_KEY, {
      ...clientOptions,
      global: {
        fetch: (input, init) =>
          authIsBroken
            ? Promise.resolve(new Response('{}', { status: 500 }))
            : fetch(input, init),
      },
    });
    const { data: link } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: lender.email,
    });
    await client.auth.verifyOtp({
      token_hash: link.properties!.hashed_token,
      type: 'magiclink',
    });
    authIsBroken = true;

    await expect(loadRoomGate(client, roomId)).rejects.toThrow();
  });

  it('sends a visitor whose session the auth server no longer accepts to sign-in', async () => {
    const revoked = await provisionPerson();
    await addMember(revoked);
    await admin.auth.admin.deleteUser(revoked.userId);

    expect(await loadRoomGate(revoked.client, roomId)).toEqual({
      kind: 'sign-in',
      path: `/lender/sign-in?next=/lender/${roomId}`,
    });
  });

  it('lets a member into an open room and hands back the room', async () => {
    expect(await loadRoomGate(lender.client, roomId)).toMatchObject({
      kind: 'open',
      room: { id: roomId, name: 'First Bank' },
    });
  });

  it('answers not found for someone who is not in the room', async () => {
    expect(await loadRoomGate(outsider.client, roomId)).toEqual({
      kind: 'not-found',
    });
  });

  it("answers not found for a room in another account's deal", async () => {
    const otherAccountRoomId = await newRoom(outsider);

    expect(await loadRoomGate(lender.client, otherAccountRoomId)).toEqual({
      kind: 'not-found',
    });
  });

  it('answers not found for a room id that is not a uuid', async () => {
    expect(await loadRoomGate(lender.client, 'not-a-room')).toEqual({
      kind: 'not-found',
    });
  });

  it('shows a member the closed page once the room is closed', async () => {
    const closedRoomId = await newRoom();
    await addMember(lender, closedRoomId);
    await closeRoom(closedRoomId);

    expect(await loadRoomGate(lender.client, closedRoomId)).toMatchObject({
      kind: 'closed',
      room: { id: closedRoomId },
    });
  });

  it('shows a member the closed page once the room has expired', async () => {
    const expiredRoomId = await newRoom();
    await addMember(lender, expiredRoomId);
    await admin
      .from('lender_room')
      .update({ expires_at: '2026-01-01T00:00:00Z' })
      .eq('id', expiredRoomId)
      .throwOnError();

    expect(await loadRoomGate(lender.client, expiredRoomId)).toMatchObject({
      kind: 'closed',
      room: { id: expiredRoomId },
    });
  });
});

describe('hasLenderRooms (integration)', () => {
  it('shows the Lender rooms link to someone who belongs to a room', async () => {
    expect(await hasLenderRooms(lender.client)).toBe(true);
  });

  it('hides the Lender rooms link from someone who belongs to none', async () => {
    expect(await hasLenderRooms(outsider.client)).toBe(false);
  });
});

describe('requestLenderRoomAccess (integration)', () => {
  const triggers: {
    name: string;
    to: { subscriberId: string; email?: string };
    payload: unknown;
  }[] = [];
  let novu: Server;
  let novuIsDown = false;
  let teammate: Person;
  let closedRoomId: string;

  beforeAll(async () => {
    novu = createServer((request, response) => {
      let body = '';
      request.on('data', (chunk) => (body += chunk));
      request.on('end', () => {
        if (novuIsDown) {
          response.statusCode = 500;
          response.end('{}');

          return;
        }

        if (request.url?.endsWith('/events/trigger')) {
          triggers.push(JSON.parse(body));
        }

        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ data: { acknowledged: true } }));
      });
    });
    await new Promise<void>((resolve) => novu.listen(0, resolve));

    teammate = await provisionPerson();
    const { data: team } = await admin
      .rpc('create_team_account', {
        account_name: `Members ${crypto.randomUUID().slice(0, 8)}`,
        user_id: owner.userId,
      })
      .throwOnError();
    await admin
      .from('accounts_memberships')
      .insert({
        account_id: team.id,
        user_id: teammate.userId,
        account_role: 'member',
      })
      .throwOnError();

    closedRoomId = await newRoom(owner, team.id);
    await addMember(lender, closedRoomId);
    await closeRoom(closedRoomId);
  });

  afterAll(() => {
    novu.close();
    vi.stubEnv('NOVU_API_KEY', '');
    vi.stubEnv('NOVU_API_URL', '');
  });

  async function asLenderWithNovu(configured = true) {
    vi.stubEnv('NOVU_API_KEY', configured ? 'test-key' : '');
    vi.stubEnv(
      'NOVU_API_URL',
      configured
        ? `http://127.0.0.1:${(novu.address() as AddressInfo).port}`
        : '',
    );
    await letWindowPass(`access:${closedRoomId}:${lender.userId}`);
    triggers.length = 0;
    testWorld.signedInClient = lender.client;
  }

  it("tells the team the room and the requester's email", async () => {
    await asLenderWithNovu();

    await unwrap(requestLenderRoomAccess({ roomId: closedRoomId }));

    expect(triggers[0]).toMatchObject({
      name: 'lender_room.access_requested',
      payload: { roomId: closedRoomId, email: lender.email },
    });
  });

  it("notifies the account's members and its primary owner once each, though the owner is also a member", async () => {
    await asLenderWithNovu();

    await unwrap(requestLenderRoomAccess({ roomId: closedRoomId }));

    expect(triggers.map((trigger) => trigger.to.subscriberId).sort()).toEqual(
      [owner.userId, teammate.userId].sort(),
    );
  });

  it("addresses each notification to the recipient's own email, so people Novu has never seen still get it", async () => {
    await asLenderWithNovu();

    await unwrap(requestLenderRoomAccess({ roomId: closedRoomId }));

    expect(
      triggers
        .map((trigger) => trigger.to)
        .sort((a, b) => a.subscriberId.localeCompare(b.subscriberId)),
    ).toEqual(
      [owner, teammate]
        .map((person) => ({ subscriberId: person.userId, email: person.email }))
        .sort((a, b) => a.subscriberId.localeCompare(b.subscriberId)),
    );
  });

  it('rings the bell once per team member, linking to the room, even when Novu is not configured', async () => {
    await asLenderWithNovu(false);

    await unwrap(requestLenderRoomAccess({ roomId: closedRoomId }));

    const { data: room } = await admin
      .from('lender_room')
      .select('account_id, deal_id, accounts(slug)')
      .eq('id', closedRoomId)
      .single()
      .throwOnError();
    const eventKey = `${closedRoomId}:${lender.userId}:${new Date().toISOString().slice(0, 10)}`;
    const { data: rung } = await admin
      .from('notifications')
      .select('recipient_user_id, deal_id, body, link, dedupe_key')
      .eq('account_id', room.account_id)
      .like('dedupe_key', `lender_room.access_requested:${eventKey}:%`)
      .order('recipient_user_id')
      .throwOnError();

    expect(rung).toEqual(
      [owner.userId, teammate.userId].toSorted().map((userId) => ({
        recipient_user_id: userId,
        deal_id: room.deal_id,
        body: `${lender.email} asked for access to First Bank`,
        link: `/home/${room.accounts.slug}/deals/${room.deal_id}/lenders/${closedRoomId}`,
        dedupe_key: `lender_room.access_requested:${eventKey}:${userId}`,
      })),
    );
  });

  it('accepts a second request inside 24 hours without notifying the team again', async () => {
    await asLenderWithNovu();
    await unwrap(requestLenderRoomAccess({ roomId: closedRoomId }));
    triggers.length = 0;

    await unwrap(requestLenderRoomAccess({ roomId: closedRoomId }));

    expect(triggers).toEqual([]);
  });

  it('refuses a request for a room that is open', async () => {
    await asLenderWithNovu();

    await expect(unwrap(requestLenderRoomAccess({ roomId }))).rejects.toThrow(
      'This room is open',
    );

    expect(triggers).toEqual([]);
  });

  it('refuses someone with no member row in the room and notifies nobody', async () => {
    await asLenderWithNovu();
    testWorld.signedInClient = outsider.client;

    await expect(
      unwrap(requestLenderRoomAccess({ roomId: closedRoomId })),
    ).rejects.toThrow('You are not a member of this room');

    expect(triggers).toEqual([]);
  });

  it('still confirms to the lender when the notification fails', async () => {
    await asLenderWithNovu();
    novuIsDown = true;

    await expect(
      unwrap(requestLenderRoomAccess({ roomId: closedRoomId })).finally(() => {
        novuIsDown = false;
      }),
    ).resolves.toBeUndefined();
  });

  it('skips sending when Novu is not configured', async () => {
    await asLenderWithNovu(false);

    await expect(
      unwrap(requestLenderRoomAccess({ roomId: closedRoomId })),
    ).resolves.toBeUndefined();

    expect(triggers).toEqual([]);
  });
});
