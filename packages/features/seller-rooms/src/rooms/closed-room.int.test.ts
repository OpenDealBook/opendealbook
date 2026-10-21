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
  admin,
  cleanUp,
  provisionPerson,
  provisionTeam,
  type Person,
} from '../test-support/world';

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON_KEY);
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY);
vi.stubEnv('NOVU_API_KEY', 'test-novu-key');
vi.stubEnv('NOVU_API_URL', 'https://novu.test');

const novu = vi.hoisted(() => ({
  triggered: [] as Record<string, unknown>[],
  fails: false,
}));

vi.mock('@odb/notifications/server', () => ({
  createNovuClient: () => ({}),
  triggerNotification: async (
    _deps: unknown,
    input: Record<string, unknown>,
  ) => {
    if (novu.fails) {
      throw new Error('novu down');
    }
    novu.triggered.push(input);
  },
}));

const world = vi.hoisted(() => ({ signedInClient: null as unknown }));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => world.signedInClient,
}));

import { loadClosedSellerRoom } from './closed-room';
import { requestSellerRoomAccess } from './request-access';

let owner: Person;
let seller: Person;
let stranger: Person;
let teamId: string;
const teamIds: string[] = [];

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
      {
        account_id: teamId,
        owner_user_id: owner.userId,
        firm_id: firm.id,
        description: 'Private team description',
      },
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

  return dealId;
}

async function room(options: { closed: boolean; archived?: boolean }) {
  const dealId = await namedDeal();
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

  if (options.closed) {
    await admin
      .from('seller_room')
      .update({ closed_at: new Date().toISOString() })
      .eq('id', roomId)
      .throwOnError();
  }

  if (options.archived) {
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

  return roomId;
}

beforeAll(async () => {
  owner = await provisionPerson();
  seller = await provisionPerson();
  stranger = await provisionPerson();
  teamId = await provisionTeam(owner, 'Acme Partners');
  teamIds.push(teamId);
});

beforeEach(() => {
  world.signedInClient = seller.client;
  novu.triggered = [];
  novu.fails = false;
});

afterAll(async () => {
  await cleanUp(teamIds);
});

describe('loadClosedSellerRoom', () => {
  it("gives the owner's email as the contact when the team has no buyer profile", async () => {
    expect(
      await loadClosedSellerRoom(admin, await room({ closed: true })),
    ).toEqual({
      contactEmail: owner.email,
      isDealArchived: false,
    });
  });

  it("gives the contact email from the team's current buyer profile", async () => {
    const otherOwner = await provisionPerson();
    teamId = await provisionTeam(otherOwner, 'Profiled Partners');
    teamIds.push(teamId);
    const savedOwner = owner;
    owner = otherOwner;

    await admin
      .from('buyer_profile')
      .insert([
        {
          account_id: teamId,
          version: 1,
          contact_json: { email: 'old@acme.test' },
        },
        {
          account_id: teamId,
          version: 2,
          contact_json: { email: 'deals@acme.test' },
        },
      ])
      .throwOnError();

    try {
      expect(
        (await loadClosedSellerRoom(admin, await room({ closed: true })))
          .contactEmail,
      ).toBe('deals@acme.test');
    } finally {
      owner = savedOwner;
      teamId = teamIds[0]!;
    }
  });

  it('says when the room is closed because the deal is archived', async () => {
    expect(
      (
        await loadClosedSellerRoom(
          admin,
          await room({ closed: false, archived: true }),
        )
      ).isDealArchived,
    ).toBe(true);
  });
});

describe('requestSellerRoomAccess', () => {
  it('accepts a request from a seller in a closed room', async () => {
    expect(
      await requestSellerRoomAccess({ roomId: await room({ closed: true }) }),
    ).toEqual({ ok: true, value: undefined });
  });

  it('emails the team once a day about a seller asking to reopen', async () => {
    const roomId = await room({ closed: true });
    const { data: placed } = await admin
      .from('seller_room')
      .select('deal_id, accounts(slug)')
      .eq('id', roomId)
      .single()
      .throwOnError();

    await requestSellerRoomAccess({ roomId });
    await requestSellerRoomAccess({ roomId });

    expect(novu.triggered).toEqual([
      {
        eventType: 'seller_room.access_requested',
        recipientUserId: owner.userId,
        email: owner.email,
        payload: {
          email: seller.email,
          dealName: 'Brennan Tooling',
          dealPath: `/home/${placed.accounts.slug}/deals/${placed.deal_id}`,
        },
      },
    ]);
  });

  it('still confirms to the seller when the team email cannot be sent', async () => {
    novu.fails = true;

    expect(
      await requestSellerRoomAccess({ roomId: await room({ closed: true }) }),
    ).toEqual({ ok: true, value: undefined });
  });

  it('refuses a request for an open room', async () => {
    expect(
      await requestSellerRoomAccess({ roomId: await room({ closed: false }) }),
    ).toEqual({ ok: false, refusal: 'This room is open' });
  });

  it('refuses someone who is not in the room', async () => {
    const roomId = await room({ closed: true });
    world.signedInClient = stranger.client;

    expect(await requestSellerRoomAccess({ roomId })).toEqual({
      ok: false,
      refusal: 'You are not a member of this room',
    });
  });

  it('refuses while the deal is archived', async () => {
    expect(
      await requestSellerRoomAccess({
        roomId: await room({ closed: true, archived: true }),
      }),
    ).toEqual({ ok: false, refusal: 'This room cannot be reopened right now' });
  });
});
