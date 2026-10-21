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
  newDeal,
  newEmail,
  provisionPerson,
  provisionTeam,
} from '@odb/seller-rooms/test-support/world.ts';

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

const { requestCounselSignIn } = await import('./sign-in-request');

type Person = Awaited<ReturnType<typeof provisionPerson>>;

const settings = {
  origin: 'https://app.odb.test',
  from: 'Deals <deals@odb.test>',
};

let owner: Person;
let counsel: Person;
let teamId: string;

function codeNameOf(dealId: string): string {
  return `Project ${dealId.slice(0, 8)}`;
}

async function namedDeal(): Promise<string> {
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

async function openDealWithCounsel(person: Person = counsel): Promise<string> {
  const dealId = await namedDeal();

  await admin
    .from('deal_counsel')
    .insert({
      account_id: teamId,
      deal_id: dealId,
      side: 'buyer',
      user_id: person.userId,
      email: person.email,
    })
    .throwOnError();

  return dealId;
}

async function clearWindow(email: string) {
  await admin
    .from('lender_rate_limit')
    .delete()
    .eq('key', `counsel-signin:${email}`)
    .throwOnError();
}

async function archiveDeal(dealId: string) {
  await admin
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: 'deal',
      p_aggregate_id: dealId,
      p_event_type: 'deal.archived',
      p_payload: {},
      p_actor_kind: 'service',
    })
    .throwOnError();
}

beforeAll(async () => {
  owner = await provisionPerson();
  counsel = await provisionPerson();
  teamId = await provisionTeam(owner, 'Acme Partners');
});

beforeEach(async () => {
  world.outbox = [];
  await clearWindow(counsel.email);
});

afterAll(async () => {
  await cleanUp([teamId]);
});

describe('requestCounselSignIn', () => {
  it("emails buyer's counsel a sign-in link back to the deal portal under the deal's code name", async () => {
    const dealId = await openDealWithCounsel();

    await requestCounselSignIn(
      admin,
      { email: counsel.email, next: `/counsel/${dealId}` },
      settings,
    );

    expect(world.outbox).toHaveLength(1);
    expect(world.outbox[0]!.to).toBe(counsel.email);
    expect(world.outbox[0]!.from).toBe('Deals <deals@odb.test>');
    expect(world.outbox[0]!.subject).toBe(
      `Your sign-in link for ${codeNameOf(dealId)}`,
    );
    expect(world.outbox[0]!.text).toContain(
      'https://app.odb.test/counsel/confirm?token_hash=',
    );
    expect(world.outbox[0]!.text).toContain(
      `next=${encodeURIComponent(`/counsel/${dealId}`)}`,
    );
    expect(world.outbox[0]!.text).toContain(
      `email=${encodeURIComponent(counsel.email)}`,
    );
  });

  it("sends seller's counsel a sign-in email with the code name in the subject and the business in the body, not another invite", async () => {
    const dealId = await namedDeal();
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
    await admin
      .from('deal_counsel')
      .insert({
        account_id: teamId,
        deal_id: dealId,
        side: 'seller',
        user_id: counsel.userId,
        email: counsel.email,
        invited_by: seller.userId,
      })
      .throwOnError();

    await requestCounselSignIn(
      admin,
      { email: counsel.email, next: `/counsel/${dealId}` },
      settings,
    );

    expect(world.outbox.map((email) => email.subject)).toEqual([
      `Your sign-in link for ${codeNameOf(dealId)}`,
    ]);
    expect(world.outbox[0]!.text).toContain('Brennan Tooling');
  });

  it('sends nothing to someone who is not counsel on the deal', async () => {
    const dealId = await newDeal(teamId, owner);

    await requestCounselSignIn(
      admin,
      { email: counsel.email, next: `/counsel/${dealId}` },
      settings,
    );

    expect(world.outbox).toEqual([]);
  });

  it('sends nothing to an address with no account', async () => {
    const dealId = await openDealWithCounsel();

    await requestCounselSignIn(
      admin,
      { email: newEmail(), next: `/counsel/${dealId}` },
      settings,
    );

    expect(world.outbox).toEqual([]);
  });

  it('sends nothing for a closed deal', async () => {
    const dealId = await openDealWithCounsel();
    await archiveDeal(dealId);

    await requestCounselSignIn(
      admin,
      { email: counsel.email, next: `/counsel/${dealId}` },
      settings,
    );

    expect(world.outbox).toEqual([]);
  });

  it('sends nothing for a destination outside the counsel portal', async () => {
    await openDealWithCounsel();

    await requestCounselSignIn(
      admin,
      { email: counsel.email, next: '/home' },
      settings,
    );

    expect(world.outbox).toEqual([]);
  });

  it('sends nothing for a second request inside two minutes', async () => {
    const dealId = await openDealWithCounsel();
    const request = { email: counsel.email, next: `/counsel/${dealId}` };

    await requestCounselSignIn(admin, request, settings);
    await requestCounselSignIn(admin, request, settings);

    expect(world.outbox).toHaveLength(1);
  });

  it('emails counsel asking from the deals list a link to their one open deal', async () => {
    const solo = await provisionPerson();
    const dealId = await openDealWithCounsel(solo);

    await requestCounselSignIn(
      admin,
      { email: solo.email, next: '/counsel' },
      settings,
    );

    expect(world.outbox).toHaveLength(1);
    expect(world.outbox[0]!.to).toBe(solo.email);
    expect(world.outbox[0]!.subject).toBe(
      `Your sign-in link for ${codeNameOf(dealId)}`,
    );
    expect(world.outbox[0]!.text).toContain(
      `next=${encodeURIComponent(`/counsel/${dealId}`)}`,
    );
  });

  it('sends nothing from the deals list to someone whose only counsel deal is closed', async () => {
    const solo = await provisionPerson();
    await archiveDeal(await openDealWithCounsel(solo));

    await requestCounselSignIn(
      admin,
      { email: solo.email, next: '/counsel' },
      settings,
    );

    expect(world.outbox).toEqual([]);
  });

  it('emails counsel on several open deals one sign-in link to the deals list', async () => {
    const busy = await provisionPerson();
    const first = await openDealWithCounsel(busy);
    const second = await openDealWithCounsel(busy);

    await requestCounselSignIn(
      admin,
      { email: busy.email, next: '/counsel' },
      settings,
    );

    expect(world.outbox).toHaveLength(1);
    expect(world.outbox[0]!.to).toBe(busy.email);
    expect([
      `Your sign-in link for ${codeNameOf(first)} and ${codeNameOf(second)}`,
      `Your sign-in link for ${codeNameOf(second)} and ${codeNameOf(first)}`,
    ]).toContain(world.outbox[0]!.subject);
    expect(world.outbox[0]!.text).toContain(
      'https://app.odb.test/counsel/confirm?token_hash=',
    );
    expect(world.outbox[0]!.text).toContain(
      `next=${encodeURIComponent('/counsel')}`,
    );
  });
});
