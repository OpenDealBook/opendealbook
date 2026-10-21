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
const { inviteBuyerCounsel } = await import('./invite-buyer-counsel');

type Person = Awaited<ReturnType<typeof provisionPerson>>;

let owner: Person;
let teamMember: Person;
let teamId: string;

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
  teamMember = await provisionPerson();
  teamId = await provisionTeam(owner, 'Acme Partners');
  await admin
    .from('accounts')
    .update({ name: 'Morgan Reyes' })
    .eq('primary_owner_user_id', owner.userId)
    .eq('is_personal_account', true)
    .throwOnError();

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
  await cleanUp([teamId]);
});

describe('inviteBuyerCounsel', () => {
  it("adds buyer's counsel and emails a sign-in link into the counsel portal", async () => {
    const dealId = await newDeal(teamId, owner);
    const email = newEmail();
    await admin
      .rpc('append_deal_event', {
        p_deal_id: dealId,
        p_aggregate_type: 'deal',
        p_aggregate_id: dealId,
        p_event_type: 'deal.updated',
        p_payload: { code_name: `Project ${dealId.slice(0, 8)}` },
        p_actor_kind: 'service',
      })
      .throwOnError();

    const result = await inviteBuyerCounsel({
      dealId,
      email,
      name: 'Ada Attorney',
    });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(await counselOf(dealId)).toEqual([
      {
        account_id: teamId,
        side: 'buyer',
        user_id: await userWithEmail(email),
        email,
        name: 'Ada Attorney',
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
      `Morgan Reyes invited you as buyer's counsel on Project ${dealId.slice(0, 8)}`,
    );
    expect(world.outbox[0]!.text).not.toContain('Seller room deal');
    expect(world.outbox[0]!.text).toContain(
      'http://localhost:3000/counsel/confirm?token_hash=',
    );
    expect(world.outbox[0]!.text).toContain(
      `next=${encodeURIComponent(`/counsel/${dealId}`)}`,
    );
  });

  it('invites without a name, leaving the name for the attorney to set', async () => {
    const dealId = await newDeal(teamId, owner);
    const email = newEmail();

    await inviteBuyerCounsel({ dealId, email });
    await userWithEmail(email);

    expect((await counselOf(dealId)).map((counsel) => counsel.name)).toEqual([
      null,
    ]);
  });

  it('reuses the login of someone who already has one', async () => {
    const dealId = await newDeal(teamId, owner);
    const existing = await provisionPerson();

    await inviteBuyerCounsel({ dealId, email: existing.email });

    expect((await counselOf(dealId)).map((c) => c.user_id)).toEqual([
      existing.userId,
    ]);
  });

  it('keeps the name the attorney set when invited again, and resends the link after two minutes', async () => {
    const dealId = await newDeal(teamId, owner);
    const email = newEmail();

    await inviteBuyerCounsel({ dealId, email, name: 'Team Typo' });
    const counselId = await userWithEmail(email);
    await admin
      .from('deal_counsel')
      .update({ name: 'Ada Attorney' })
      .eq('deal_id', dealId)
      .eq('user_id', counselId)
      .throwOnError();
    await admin
      .from('lender_rate_limit')
      .delete()
      .eq('key', `counsel-signin:${email}`)
      .throwOnError();

    const again = await inviteBuyerCounsel({
      dealId,
      email,
      name: 'Team Typo',
    });

    expect(again).toEqual({ ok: true, value: undefined });
    expect((await counselOf(dealId)).map((c) => c.name)).toEqual([
      'Ada Attorney',
    ]);
    expect(world.outbox).toHaveLength(2);
  });

  it('refuses a second link to the same address within two minutes', async () => {
    const dealId = await newDeal(teamId, owner);
    const email = newEmail();

    await inviteBuyerCounsel({ dealId, email });
    await userWithEmail(email);

    const again = await inviteBuyerCounsel({ dealId, email });

    expect(again).toEqual({
      ok: false,
      refusal:
        'A sign-in link was sent to this address in the last 2 minutes. Try again shortly.',
    });
    expect(await counselOf(dealId)).toHaveLength(1);
    expect(world.outbox).toHaveLength(1);
  });

  it("refuses someone who is already seller's counsel on the deal, and sends nothing", async () => {
    const dealId = await newDeal(teamId, owner);
    const sellerCounsel = await provisionPerson();
    await admin
      .from('deal_counsel')
      .insert({
        account_id: teamId,
        deal_id: dealId,
        side: 'seller',
        user_id: sellerCounsel.userId,
        email: sellerCounsel.email,
      })
      .throwOnError();

    const result = await inviteBuyerCounsel({
      dealId,
      email: sellerCounsel.email,
    });

    expect(result).toEqual({
      ok: false,
      refusal: 'This person is already on another side of this deal.',
    });
    expect((await counselOf(dealId)).map((c) => c.side)).toEqual(['seller']);
    expect(world.outbox).toEqual([]);
  });

  it("refuses a seller in the deal's seller room, and sends nothing", async () => {
    const dealId = await newDeal(teamId, owner);
    const seller = await provisionPerson();
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

    const result = await inviteBuyerCounsel({ dealId, email: seller.email });

    expect(result).toEqual({
      ok: false,
      refusal: 'This person is already on another side of this deal.',
    });
    expect(await counselOf(dealId)).toEqual([]);
    expect(world.outbox).toEqual([]);
  });

  it("refuses a lender in one of the deal's lender rooms", async () => {
    const dealId = await newDeal(teamId, owner);
    const lender = await lenderOn(dealId, teamId);

    const result = await inviteBuyerCounsel({ dealId, email: lender.email });

    expect(result).toEqual({
      ok: false,
      refusal: 'This person is already on another side of this deal.',
    });
    expect(await counselOf(dealId)).toEqual([]);
  });

  it("lets a member of the deal team be buyer's counsel", async () => {
    const dealId = await newDeal(teamId, owner);

    const result = await inviteBuyerCounsel({
      dealId,
      email: teamMember.email,
    });

    expect(result).toEqual({ ok: true, value: undefined });
  });

  it('refuses a team member who cannot manage the deal', async () => {
    const dealId = await newDeal(teamId, owner);
    world.signedInClient = teamMember.client;

    const result = await inviteBuyerCounsel({ dealId, email: newEmail() });

    expect(result).toEqual({
      ok: false,
      refusal: 'You cannot invite counsel to this deal.',
    });
    expect(await counselOf(dealId)).toEqual([]);
    expect(world.outbox).toEqual([]);
  });

  it('refuses someone outside the team', async () => {
    const dealId = await newDeal(teamId, owner);
    world.signedInClient = (await provisionPerson()).client;

    const result = await inviteBuyerCounsel({ dealId, email: newEmail() });

    expect(result).toEqual({
      ok: false,
      refusal: 'You cannot invite counsel to this deal.',
    });
    expect(await counselOf(dealId)).toEqual([]);
  });

  it('refuses a locked team up front', async () => {
    const dealId = await newDeal(teamId, owner);

    await withLockedTeam(teamId, async () => {
      const result = await inviteBuyerCounsel({ dealId, email: newEmail() });

      expect(result).toEqual({
        ok: false,
        refusal: 'This team is read-only until billing is updated.',
      });
    });

    expect(await counselOf(dealId)).toEqual([]);
    expect(world.outbox).toEqual([]);
  });

  it('refuses when deal email is not set up, and adds no one', async () => {
    vi.stubEnv('SELLER_DELIVERY_FROM_EMAIL', undefined);
    const dealId = await newDeal(teamId, owner);

    const result = await inviteBuyerCounsel({ dealId, email: newEmail() });

    expect(result).toEqual({
      ok: false,
      refusal: 'Counsel email is not set up',
    });
    expect(await counselOf(dealId)).toEqual([]);
  });

  it('keeps the invite and says so when the email cannot be sent', async () => {
    const dealId = await newDeal(teamId, owner);
    const email = newEmail();
    world.mailIsDown = true;

    const result = await inviteBuyerCounsel({ dealId, email });
    await userWithEmail(email);

    expect(result).toEqual({
      ok: false,
      refusal:
        'The invite was saved but the email could not be sent. Send it again.',
    });
    expect(await counselOf(dealId)).toHaveLength(1);
  });

  it.each(['deal.archived', 'deal.resolved'] as const)(
    'refuses inviting counsel onto a deal after %s, and adds no one',
    async (eventType) => {
      const dealId = await newDeal(teamId, owner);
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

      const result = await inviteBuyerCounsel({ dealId, email: newEmail() });

      expect(result).toEqual({
        ok: false,
        refusal: 'This deal is closed, so counsel cannot be invited.',
      });
      expect(await counselOf(dealId)).toEqual([]);
      expect(world.outbox).toEqual([]);
    },
  );
});
