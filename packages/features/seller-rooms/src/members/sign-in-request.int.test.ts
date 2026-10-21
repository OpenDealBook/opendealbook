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
  cleanUp,
  newEmail,
  type Person,
  provisionPerson,
  provisionTeam,
} from '../test-support/world';

interface SentEmail {
  to: string;
  from: string;
  subject: string;
  text: string;
}

const world = vi.hoisted(() => ({ outbox: [] as SentEmail[] }));

vi.mock('@odb/mailers', () => ({
  getMailer: async () => ({
    sendEmail: async (email: SentEmail) => {
      world.outbox.push(email);

      return {};
    },
  }),
}));

const { requestSellerSignIn } = await import('./sign-in-request');

const settings = {
  origin: 'https://app.odb.test',
  from: 'Deals <deals@odb.test>',
};

let owner: Person;
let teamId: string;

async function namedDeal(
  businessName: string,
  codeName?: string,
): Promise<string> {
  const dealId = crypto.randomUUID();
  const { data: firm } = await admin
    .from('firm')
    .insert({ account_id: teamId, name: businessName })
    .select('id')
    .single()
    .throwOnError();
  const events = [
    [
      'deal.created',
      {
        account_id: teamId,
        owner_user_id: owner.userId,
        firm_id: firm.id,
        description: 'Private team description',
      },
    ],
    ...(codeName ? [['deal.updated', { code_name: codeName }] as const] : []),
  ] as const;
  for (const [eventType, payload] of events) {
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

async function roomFor(
  seller: Person,
  businessName: string,
  codeName?: string,
): Promise<string> {
  const dealId = await namedDeal(businessName, codeName);

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

  return roomId;
}

beforeAll(async () => {
  owner = await provisionPerson();
  teamId = await provisionTeam(owner, 'Acme Partners');
});

beforeEach(() => {
  world.outbox = [];
});

afterAll(async () => {
  await cleanUp([teamId]);
});

describe('requestSellerSignIn', () => {
  it('emails a seller asking from the rooms list a link back to the list that names the deal', async () => {
    const seller = await provisionPerson();
    await roomFor(seller, 'Brennan Climate Services', 'Project Atlas');

    await requestSellerSignIn(
      admin,
      { email: seller.email, next: '/seller' },
      settings,
    );

    expect(world.outbox).toHaveLength(1);
    expect(world.outbox[0]!.to).toBe(seller.email);
    expect(world.outbox[0]!.from).toBe('Deals <deals@odb.test>');
    expect(world.outbox[0]!.subject).toBe(
      'Your sign-in link for Project Atlas',
    );
    expect(world.outbox[0]!.text).toContain('Brennan Climate Services');
    expect(world.outbox[0]!.text).not.toContain('Private team description');
    expect(world.outbox[0]!.text).toContain(
      'https://app.odb.test/seller/confirm?token_hash=',
    );
    expect(world.outbox[0]!.text).toContain('next=%2Fseller&');
    expect(world.outbox[0]!.text).toContain(
      `email=${encodeURIComponent(seller.email)}`,
    );
  });

  it('names every deal for a seller in several rooms, by business name in order', async () => {
    const seller = await provisionPerson();
    await roomFor(seller, 'Harbor Marine');
    await roomFor(seller, 'Brennan Climate Services');

    await requestSellerSignIn(
      admin,
      { email: seller.email, next: '/seller' },
      settings,
    );

    expect(world.outbox.map((email) => email.subject)).toEqual([
      'Your sign-in link for Brennan Climate Services and Harbor Marine',
    ]);
  });

  it('sends nothing from the rooms list to someone in no room', async () => {
    const stranger = await provisionPerson();

    await requestSellerSignIn(
      admin,
      { email: stranger.email, next: '/seller' },
      settings,
    );

    expect(world.outbox).toEqual([]);
  });

  it('sends nothing to an address with no account', async () => {
    await requestSellerSignIn(
      admin,
      { email: newEmail(), next: '/seller' },
      settings,
    );

    expect(world.outbox).toEqual([]);
  });

  it('emails a room member a link back to the room that names the deal', async () => {
    const seller = await provisionPerson();
    const roomId = await roomFor(seller, 'Brennan Climate Services');

    await requestSellerSignIn(
      admin,
      { email: seller.email, next: `/seller/rooms/${roomId}` },
      settings,
    );

    expect(world.outbox[0]!.subject).toBe(
      'Your sign-in link for Brennan Climate Services',
    );
    expect(world.outbox[0]!.text).toContain(
      `next=${encodeURIComponent(`/seller/rooms/${roomId}`)}`,
    );
  });

  it('sends nothing to someone who is not in the room', async () => {
    const seller = await provisionPerson();
    const outsider = await provisionPerson();
    const roomId = await roomFor(seller, 'Brennan Climate Services');

    await requestSellerSignIn(
      admin,
      { email: outsider.email, next: `/seller/rooms/${roomId}` },
      settings,
    );

    expect(world.outbox).toEqual([]);
  });

  it('emails the recipient of a shared document a link back to it that names the deal', async () => {
    const seller = await provisionPerson();
    const dealId = await namedDeal('Harbor Marine');
    const { data: generated } = await admin
      .from('generated_document')
      .insert({ account_id: teamId, deal_id: dealId })
      .select('id')
      .single()
      .throwOnError();
    const { data: share } = await admin
      .from('document_share')
      .insert({
        account_id: teamId,
        generated_document_id: generated.id,
        recipient_user_id: seller.userId,
      })
      .select('id')
      .single()
      .throwOnError();

    await requestSellerSignIn(
      admin,
      { email: seller.email, next: `/seller/documents/${share.id}` },
      settings,
    );

    expect(world.outbox[0]!.subject).toBe(
      'Your sign-in link for Harbor Marine',
    );
    expect(world.outbox[0]!.text).toContain(
      `next=${encodeURIComponent(`/seller/documents/${share.id}`)}`,
    );
  });

  it('sends nothing for a second request inside two minutes', async () => {
    const seller = await provisionPerson();
    await roomFor(seller, 'Brennan Climate Services');
    const request = { email: seller.email, next: '/seller' };

    await requestSellerSignIn(admin, request, settings);
    await requestSellerSignIn(admin, request, settings);

    expect(world.outbox).toHaveLength(1);
  });
});
