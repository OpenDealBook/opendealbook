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
  withLockedTeam,
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

import {
  closeSellerRoom,
  prepareSellerRoomClose,
  reopenSellerRoom,
} from './actions';

let owner: Person;
let teamMember: Person;
let seller: Person;
let teamId: string;

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

async function roomWithSeller() {
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

  return dealId;
}

const CLOSING_TODO = 'Tell the seller/broker the room is closing';

async function closingTodos(dealId: string) {
  const { data } = await admin
    .from('personal_todo')
    .select('user_id, done')
    .eq('deal_id', dealId)
    .eq('title', CLOSING_TODO)
    .throwOnError();

  return data;
}

async function toldSellers(dealId: string) {
  await prepareSellerRoomClose({ dealId });
  await admin
    .from('personal_todo')
    .update({ done: true })
    .eq('deal_id', dealId)
    .eq('title', CLOSING_TODO)
    .throwOnError();
}

async function sellerSeesOpen(dealId: string) {
  const { data } = await seller.client
    .rpc('my_seller_rooms')
    .eq('deal_id', dealId)
    .single()
    .throwOnError();

  return data.is_open;
}

beforeAll(async () => {
  owner = await provisionPerson();
  teamMember = await provisionPerson();
  seller = await provisionPerson();
  teamId = await provisionTeam(owner, 'Acme Partners');

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
  novu.triggered = [];
  novu.fails = false;
});

afterAll(async () => {
  await cleanUp([teamId]);
});

describe('closing and reopening a seller room', () => {
  it('will not close until the team has told the sellers', async () => {
    const dealId = await roomWithSeller();

    expect(await closeSellerRoom({ dealId })).toEqual({
      ok: false,
      refusal: 'Tell the sellers or brokers the room is closing first',
    });
    expect(await sellerSeesOpen(dealId)).toBe(true);
  });

  it('gives the person starting a close one to-do on the deal, however often they start', async () => {
    const dealId = await roomWithSeller();

    await prepareSellerRoomClose({ dealId });
    await prepareSellerRoomClose({ dealId });

    expect(await closingTodos(dealId)).toEqual([
      { user_id: owner.userId, done: false },
    ]);
    expect(await closeSellerRoom({ dealId })).toMatchObject({ ok: false });
  });

  it('closes once a closing to-do is ticked, and the next close needs a new one', async () => {
    const dealId = await roomWithSeller();
    await toldSellers(dealId);

    expect(await closeSellerRoom({ dealId })).toEqual({
      ok: true,
      value: undefined,
    });
    await reopenSellerRoom({ dealId });

    expect(await closeSellerRoom({ dealId })).toEqual({
      ok: false,
      refusal: 'Tell the sellers or brokers the room is closing first',
    });
  });

  it('closes the room for its sellers, and reopens it', async () => {
    const dealId = await roomWithSeller();
    await toldSellers(dealId);

    expect(await closeSellerRoom({ dealId })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await sellerSeesOpen(dealId)).toBe(false);

    expect(await reopenSellerRoom({ dealId })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await sellerSeesOpen(dealId)).toBe(true);
  });

  it('emails each seller a short note when the room closes and when it reopens', async () => {
    const dealId = await roomWithSeller();
    await toldSellers(dealId);
    const { data: room } = await admin
      .from('seller_room')
      .select('id')
      .eq('deal_id', dealId)
      .single()
      .throwOnError();
    const note = {
      recipientUserId: seller.userId,
      email: seller.email,
      payload: {
        teamName: 'Acme Partners',
        dealName: 'Brennan Tooling',
        outsideName: `Project ${dealId.slice(0, 8)}`,
        roomPath: `/seller/rooms/${room.id}`,
      },
    };

    await closeSellerRoom({ dealId });
    await reopenSellerRoom({ dealId });

    expect(novu.triggered).toEqual([
      { eventType: 'seller_room.closed', ...note },
      { eventType: 'seller_room.reopened', ...note },
    ]);
  });

  it('still closes the room when the note to sellers cannot be sent', async () => {
    const dealId = await roomWithSeller();
    await toldSellers(dealId);
    novu.fails = true;

    expect(await closeSellerRoom({ dealId })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await sellerSeesOpen(dealId)).toBe(false);
  });

  it('refuses to close a closed room or reopen an open one', async () => {
    const dealId = await roomWithSeller();
    await toldSellers(dealId);

    expect(await reopenSellerRoom({ dealId })).toEqual({
      ok: false,
      refusal: 'This room is already open',
    });

    await closeSellerRoom({ dealId });

    expect(await closeSellerRoom({ dealId })).toEqual({
      ok: false,
      refusal: 'This room is already closed',
    });
  });

  it('refuses to reopen a room whose deal is archived', async () => {
    const dealId = await roomWithSeller();
    await toldSellers(dealId);
    await closeSellerRoom({ dealId });
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

    expect(await reopenSellerRoom({ dealId })).toEqual({
      ok: false,
      refusal: 'Unarchive the deal to reopen this room',
    });
  });

  it('refuses a team member who cannot manage the deal', async () => {
    const dealId = await roomWithSeller();
    await toldSellers(dealId);
    world.signedInClient = teamMember.client;

    expect(await closeSellerRoom({ dealId })).toEqual({
      ok: false,
      refusal: 'You cannot change this seller room.',
    });
    expect(await sellerSeesOpen(dealId)).toBe(true);
  });

  it('refuses a locked team', async () => {
    const dealId = await roomWithSeller();
    await toldSellers(dealId);

    await withLockedTeam(teamId, async () => {
      expect(await closeSellerRoom({ dealId })).toEqual({
        ok: false,
        refusal: 'This team is read-only until billing is updated.',
      });
    });
    expect(await sellerSeesOpen(dealId)).toBe(true);
  });
});
