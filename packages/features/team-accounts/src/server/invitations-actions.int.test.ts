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
  admin,
  ANON_KEY,
  cleanUp,
  type Person,
  provisionPerson,
  provisionTeam,
  SERVICE_ROLE_KEY,
  SUPABASE_URL,
} from '@odb/seller-rooms/test-support/world.ts';

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON_KEY);
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY);
vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000');
vi.stubEnv('SELLER_DELIVERY_FROM_EMAIL', 'Deals <deals@odb.test>');

interface SentEmail {
  to: string;
  from: string;
  replyTo?: string;
  subject: string;
  text: string;
}

const world = vi.hoisted(() => ({
  actor: null as unknown,
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

vi.mock('@odb/next/actions', () => ({
  enhanceAction:
    (fn: (input: unknown, user: { id: string }) => unknown) =>
    (input: unknown) =>
      fn(input, { id: (world.actor as Person).userId }),
}));

vi.mock('@odb/supabase/server', async (original) => ({
  ...(await original<object>()),
  getSupabaseServerClient: () => (world.actor as Person).client,
}));

import {
  invitationLinkAction,
  inviteMembersAction,
  resendInvitationAction,
} from './invitations-actions';

let owner: Person;
let member: Person;
let teamId: string;
let teamSlug: string;
let ownerName: string;
let invitation: { id: number; invite_token: string; expires_at: string };

function newInvitee() {
  return `invitee-${crypto.randomUUID().slice(0, 8)}@odb.test`;
}

async function invitationsTo(email: string) {
  const { data } = await admin
    .from('invitations')
    .select('invite_token')
    .eq('email', email)
    .throwOnError();

  return data;
}

beforeAll(async () => {
  owner = await provisionPerson();
  member = await provisionPerson();
  teamId = await provisionTeam(owner, 'Beacon Partners');

  const { data: team } = await admin
    .from('accounts')
    .select('slug')
    .eq('id', teamId)
    .single()
    .throwOnError();
  teamSlug = team.slug!;

  const { data: personal } = await admin
    .from('accounts')
    .select('name')
    .eq('id', owner.userId)
    .single()
    .throwOnError();
  ownerName = personal.name;

  await admin
    .from('accounts_memberships')
    .insert({
      account_id: teamId,
      user_id: member.userId,
      account_role: 'member',
    })
    .throwOnError();

  const { data } = await admin
    .from('invitations')
    .insert({
      account_id: teamId,
      email: newInvitee(),
      invited_by: owner.userId,
      role: 'member',
    })
    .select('id, invite_token, expires_at')
    .single()
    .throwOnError();

  invitation = data;
});

afterAll(async () => {
  await cleanUp([teamId]);
});

beforeEach(() => {
  world.outbox = [];
  world.mailIsDown = false;
});

describe('inviting', () => {
  it('emails the invitee from the inviter via Open Deal Book with the join link', async () => {
    world.actor = owner;
    const email = newInvitee();

    await inviteMembersAction({
      slug: teamSlug,
      invitations: [{ email, role: 'member' }],
    });

    const [row] = await invitationsTo(email);

    expect(world.outbox).toHaveLength(1);
    expect(world.outbox[0]).toMatchObject({
      to: email,
      from: `"${ownerName} via Open Deal Book" <deals@odb.test>`,
      replyTo: owner.email,
    });
    expect(world.outbox[0]!.text).toContain('Beacon Partners');
    expect(world.outbox[0]!.text).toContain(ownerName);
    expect(world.outbox[0]!.text).toContain(
      `http://localhost:3000/join?token=${row!.invite_token}`,
    );
  });

  it('keeps the invitation and says to resend when the email fails', async () => {
    world.actor = owner;
    world.mailIsDown = true;
    const email = newInvitee();

    await expect(
      inviteMembersAction({
        slug: teamSlug,
        invitations: [{ email, role: 'member' }],
      }),
    ).rejects.toThrow(
      "Invitation saved, but the email didn't send. Use Resend.",
    );

    expect(await invitationsTo(email)).toHaveLength(1);
  });
});

describe('invitation link', () => {
  it('gives someone who manages invites the join token', async () => {
    world.actor = owner;

    await expect(
      invitationLinkAction({ invitationId: invitation.id }),
    ).resolves.toEqual({ token: invitation.invite_token });
  });

  it('refuses a team member who cannot manage invites', async () => {
    world.actor = member;

    await expect(
      invitationLinkAction({ invitationId: invitation.id }),
    ).rejects.toThrow();
  });
});

describe('resend', () => {
  it('emails the invitee again', async () => {
    world.actor = owner;

    await resendInvitationAction({ invitationId: invitation.id });

    expect(world.outbox).toHaveLength(1);
    expect(world.outbox[0]!.text).toContain(
      `/join?token=${invitation.invite_token}`,
    );
  });

  it('extends the expiry without adding a second invitation', async () => {
    world.actor = owner;

    await resendInvitationAction({ invitationId: invitation.id });

    const { data: rows } = await admin
      .from('invitations')
      .select('id, expires_at')
      .eq('id', invitation.id)
      .throwOnError();

    expect(rows).toHaveLength(1);
    expect(Date.parse(rows[0]!.expires_at)).toBeGreaterThan(
      Date.parse(invitation.expires_at),
    );
  });
});
