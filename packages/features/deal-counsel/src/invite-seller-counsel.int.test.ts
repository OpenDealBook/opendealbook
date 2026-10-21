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
  ANON_KEY,
  SERVICE_ROLE_KEY,
  SUPABASE_URL,
} from '@odb/seller-rooms/test-support/world.ts';

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

const {
  admin,
  cleanUp,
  createdUserIds,
  newDeal,
  newEmail,
  provisionPerson,
  provisionTeam,
  withLockedTeam,
} = await import('@odb/seller-rooms/test-support/world.ts');
const { inviteSellerCounsel, listSellerCounsel } =
  await import('./invite-seller-counsel');

type Person = Awaited<ReturnType<typeof provisionPerson>>;

let owner: Person;
let seller: Person;
let teamId: string;

async function dealWithSeller(): Promise<string> {
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
      { account_id: teamId, owner_user_id: owner.userId, firm_id: firm.id },
    ],
    ['deal.updated', { code_name: `Project ${dealId.slice(0, 8)}` }],
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
  const { data: roomId } = await owner.client
    .rpc('ensure_seller_room', { deal_id: dealId })
    .throwOnError();

  await admin
    .from('seller_room_member')
    .insert({
      room_id: roomId,
      user_id: seller.userId,
      email: seller.email,
      name: 'Sam Seller',
    })
    .throwOnError();

  return dealId;
}

async function counselOf(dealId: string) {
  const { data } = await admin
    .from('deal_counsel')
    .select('account_id, side, user_id, email, name, invited_by')
    .eq('deal_id', dealId)
    .throwOnError();

  return data;
}

async function userWithEmail(email: string) {
  const { data } = await admin
    .from('accounts')
    .select('primary_owner_user_id')
    .eq('email', email)
    .eq('is_personal_account', true)
    .maybeSingle()
    .throwOnError();

  createdUserIds.push(data!.primary_owner_user_id);

  return data!.primary_owner_user_id;
}

async function lenderOn(dealId: string, accountId: string) {
  const lender = await provisionPerson();
  const { data: folder } = await admin
    .from('dr_folder')
    .insert({ account_id: accountId, deal_id: dealId, name: 'Lender room' })
    .select('id')
    .single()
    .throwOnError();
  const { data: room } = await admin
    .from('lender_room')
    .insert({
      account_id: accountId,
      deal_id: dealId,
      name: 'First Bank',
      private_folder_id: folder.id,
    })
    .select('id')
    .single()
    .throwOnError();
  await admin
    .from('lender_room_member')
    .insert({ room_id: room.id, user_id: lender.userId, email: lender.email })
    .throwOnError();

  return lender;
}

beforeAll(async () => {
  owner = await provisionPerson();
  seller = await provisionPerson();
  teamId = await provisionTeam(owner, 'Acme Partners');
});

beforeEach(() => {
  world.signedInClient = seller.client;
  world.outbox = [];
  world.mailIsDown = false;
  vi.stubEnv('SELLER_DELIVERY_FROM_EMAIL', 'Deals <deals@odb.test>');
});

afterAll(async () => {
  await cleanUp([teamId]);
});

describe('inviteSellerCounsel', () => {
  it("adds seller's counsel and emails a sign-in link into the counsel portal from the deal sender", async () => {
    const dealId = await dealWithSeller();
    const email = newEmail();

    const result = await inviteSellerCounsel({
      dealId,
      email,
      name: 'Sol Solicitor',
    });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(await counselOf(dealId)).toEqual([
      {
        account_id: teamId,
        side: 'seller',
        user_id: await userWithEmail(email),
        email,
        name: 'Sol Solicitor',
        invited_by: seller.userId,
      },
    ]);
    expect(world.outbox).toHaveLength(1);
    expect(world.outbox[0]!.to).toBe(email);
    expect(world.outbox[0]!.from).toBe(
      '"Sam Seller via Open Deal Book" <deals@odb.test>',
    );
    expect(world.outbox[0]!.replyTo).toBe(seller.email);
    expect(world.outbox[0]!.subject).toBe(
      `Sam Seller invited you as their counsel on Project ${dealId.slice(0, 8)}`,
    );
    expect(world.outbox[0]!.text).toContain(
      'Sam Seller invited you to act as their counsel on the sale of Brennan Tooling to Acme Partners',
    );
    expect(world.outbox[0]!.text).toContain(
      'http://localhost:3000/counsel/confirm?token_hash=',
    );
    expect(world.outbox[0]!.text).toContain(
      `next=${encodeURIComponent(`/counsel/${dealId}`)}`,
    );
  });

  it('invites without a name, leaving the name for the attorney to set', async () => {
    const dealId = await dealWithSeller();
    const email = newEmail();

    await inviteSellerCounsel({ dealId, email });
    await userWithEmail(email);

    expect((await counselOf(dealId)).map((counsel) => counsel.name)).toEqual([
      null,
    ]);
  });

  it('refuses a second link to the same address within two minutes', async () => {
    const dealId = await dealWithSeller();
    const email = newEmail();

    await inviteSellerCounsel({ dealId, email });
    await userWithEmail(email);

    const again = await inviteSellerCounsel({ dealId, email });

    expect(again).toEqual({
      ok: false,
      refusal:
        'A sign-in link was sent to this address in the last 2 minutes. Try again shortly.',
    });
    expect(await counselOf(dealId)).toHaveLength(1);
    expect(world.outbox).toHaveLength(1);
  });

  it('resends to invited counsel after two minutes without adding a second row', async () => {
    const dealId = await dealWithSeller();
    const email = newEmail();

    await inviteSellerCounsel({ dealId, email, name: 'Owen Castillo' });
    await userWithEmail(email);
    await admin
      .from('lender_rate_limit')
      .update({ last_at: new Date(Date.now() - 121_000).toISOString() })
      .eq('key', `counsel-signin:${email}`)
      .throwOnError();

    const again = await inviteSellerCounsel({ dealId, email });

    expect(again).toEqual({ ok: true, value: undefined });
    expect(await counselOf(dealId)).toHaveLength(1);
    expect(world.outbox.map((sent) => sent.to)).toEqual([email, email]);
  });

  it('keeps the invite and says so when the email cannot be sent', async () => {
    const dealId = await dealWithSeller();
    const email = newEmail();
    world.mailIsDown = true;

    const result = await inviteSellerCounsel({ dealId, email });
    await userWithEmail(email);

    expect(result).toEqual({
      ok: false,
      refusal:
        'The invite was saved but the email could not be sent. Send it again.',
    });
    expect(await counselOf(dealId)).toHaveLength(1);
  });

  it('refuses when deal email is not set up, and adds no one', async () => {
    vi.stubEnv('SELLER_DELIVERY_FROM_EMAIL', undefined);
    const dealId = await dealWithSeller();

    const result = await inviteSellerCounsel({ dealId, email: newEmail() });

    expect(result).toEqual({
      ok: false,
      refusal: 'Counsel email is not set up',
    });
    expect(await counselOf(dealId)).toEqual([]);
  });

  it('refuses a member of the deal team, and sends nothing', async () => {
    const dealId = await dealWithSeller();

    const result = await inviteSellerCounsel({ dealId, email: owner.email });

    expect(result).toEqual({
      ok: false,
      refusal: 'This person is already on another side of this deal.',
    });
    expect(await counselOf(dealId)).toEqual([]);
    expect(world.outbox).toEqual([]);
  });

  it("refuses a lender in one of the deal's lender rooms", async () => {
    const dealId = await dealWithSeller();
    const lender = await lenderOn(dealId, teamId);

    const result = await inviteSellerCounsel({ dealId, email: lender.email });

    expect(result).toEqual({
      ok: false,
      refusal: 'This person is already on another side of this deal.',
    });
    expect(await counselOf(dealId)).toEqual([]);
  });

  it("refuses seller's counsel inviting more counsel", async () => {
    const dealId = await dealWithSeller();
    const counsel = await provisionPerson();
    await admin
      .from('deal_counsel')
      .insert({
        account_id: teamId,
        deal_id: dealId,
        side: 'seller',
        user_id: counsel.userId,
        email: counsel.email,
      })
      .throwOnError();
    world.signedInClient = counsel.client;

    const result = await inviteSellerCounsel({ dealId, email: newEmail() });

    expect(result).toEqual({
      ok: false,
      refusal: 'You cannot invite counsel to this deal.',
    });
    expect(await counselOf(dealId)).toHaveLength(1);
    expect(world.outbox).toEqual([]);
  });

  it("refuses someone who is already buyer's counsel on the deal, and sends nothing", async () => {
    const dealId = await dealWithSeller();
    const buyerCounsel = await provisionPerson();
    await admin
      .from('deal_counsel')
      .insert({
        account_id: teamId,
        deal_id: dealId,
        side: 'buyer',
        user_id: buyerCounsel.userId,
        email: buyerCounsel.email,
      })
      .throwOnError();

    const result = await inviteSellerCounsel({
      dealId,
      email: buyerCounsel.email,
    });

    expect(result).toEqual({
      ok: false,
      refusal: 'This person is already on another side of this deal.',
    });
    expect((await counselOf(dealId)).map((c) => c.side)).toEqual(['buyer']);
    expect(world.outbox).toEqual([]);
  });

  it('refuses the deal team, who invite only buyer counsel', async () => {
    const dealId = await dealWithSeller();
    world.signedInClient = owner.client;

    const result = await inviteSellerCounsel({ dealId, email: newEmail() });

    expect(result).toEqual({
      ok: false,
      refusal: 'You cannot invite counsel to this deal.',
    });
    expect(await counselOf(dealId)).toEqual([]);
  });

  it('refuses a seller from another deal', async () => {
    await dealWithSeller();
    const otherDealId = await newDeal(teamId, owner);

    const result = await inviteSellerCounsel({
      dealId: otherDealId,
      email: newEmail(),
    });

    expect(result).toEqual({
      ok: false,
      refusal: 'You cannot invite counsel to this deal.',
    });
    expect(await counselOf(otherDealId)).toEqual([]);
  });

  it('refuses inviting once the team closes the seller room, saying why, and adds no one', async () => {
    const dealId = await dealWithSeller();
    await admin
      .from('seller_room')
      .update({ closed_at: new Date().toISOString() })
      .eq('deal_id', dealId)
      .throwOnError();

    const result = await inviteSellerCounsel({ dealId, email: newEmail() });

    expect(result).toEqual({
      ok: false,
      refusal: 'The seller room is closed, so this is read-only.',
    });
    expect(await counselOf(dealId)).toEqual([]);
  });

  it('still lets the seller invite while the team is locked', async () => {
    const dealId = await dealWithSeller();
    const email = newEmail();

    await withLockedTeam(teamId, async () => {
      const result = await inviteSellerCounsel({ dealId, email });

      expect(result).toEqual({ ok: true, value: undefined });
    });
    await userWithEmail(email);

    expect(await counselOf(dealId)).toHaveLength(1);
  });

  it.each(['deal.archived', 'deal.resolved'] as const)(
    'refuses inviting counsel onto a deal after %s, and adds no one',
    async (eventType) => {
      const dealId = await dealWithSeller();
      await admin
        .rpc('append_deal_event', {
          p_deal_id: dealId,
          p_aggregate_type: 'deal',
          p_aggregate_id: dealId,
          p_event_type: eventType,
          p_payload: eventType === 'deal.resolved' ? { resolution: 'won' } : {},
          p_actor_kind: 'service',
        })
        .throwOnError();

      const result = await inviteSellerCounsel({ dealId, email: newEmail() });

      expect(result).toEqual({
        ok: false,
        refusal: 'This deal has closed, so everything here is read-only.',
      });
      expect(await counselOf(dealId)).toEqual([]);
      expect(world.outbox).toEqual([]);
    },
  );
});

describe('listSellerCounsel', () => {
  it('shows the seller each invited counsel, when invited, and whether they have signed in', async () => {
    const dealId = await dealWithSeller();
    const notYet = newEmail();
    await inviteSellerCounsel({ dealId, email: notYet, name: 'Owen Castillo' });
    await userWithEmail(notYet);
    const joined = await provisionPerson();
    await admin
      .from('deal_counsel')
      .insert({
        account_id: teamId,
        deal_id: dealId,
        side: 'seller',
        user_id: joined.userId,
        email: joined.email,
        created_at: '2026-10-19T12:00:00Z',
      })
      .throwOnError();

    const counsel = await listSellerCounsel(dealId);

    expect(counsel).toEqual(
      expect.arrayContaining([
        {
          name: 'Owen Castillo',
          email: notYet,
          invitedAt: expect.any(String),
          joined: false,
        },
        {
          name: null,
          email: joined.email,
          invitedAt: '2026-10-19T12:00:00+00:00',
          joined: true,
        },
      ]),
    );
    expect(counsel).toHaveLength(2);
  });

  it('lists counsel oldest invite first', async () => {
    const dealId = await dealWithSeller();
    const [later, earlier] = (
      await Promise.all([provisionPerson(), provisionPerson()])
    ).sort((a, b) => a.userId.localeCompare(b.userId));
    await admin
      .from('deal_counsel')
      .insert(
        [
          { person: later, invitedAt: '2026-10-19T12:00:00Z' },
          { person: earlier, invitedAt: '2026-10-18T12:00:00Z' },
        ].map(({ person, invitedAt }) => ({
          account_id: teamId,
          deal_id: dealId,
          side: 'seller' as const,
          user_id: person.userId,
          email: person.email,
          created_at: invitedAt,
        })),
      )
      .throwOnError();

    expect(
      (await listSellerCounsel(dealId)).map((counsel) => counsel.email),
    ).toEqual([earlier.email, later.email]);
  });
});
