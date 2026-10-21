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
  newDeal,
  provisionPerson,
  provisionTeam,
  type Person,
} from '../test-support/world';

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON_KEY);
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY);

interface SentEmail {
  to: string;
  from: string;
  subject: string;
}

const world = vi.hoisted(() => ({
  signedInClient: null as unknown,
  outbox: [] as SentEmail[],
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => world.signedInClient,
}));

vi.mock('@odb/mailers', () => ({
  getMailer: async () => ({
    sendEmail: async (email: SentEmail) => {
      world.outbox.push(email);
      return {};
    },
  }),
}));

import { removeSeller } from './actions';
import { countDealTeam, dealOwnerName, loadSellerRoomPeople } from './people';

let owner: Person;
let teamMember: Person;
let seller: Person;
let teamId: string;
let dealId: string;
let roomId: string;
let uploaded: string;

beforeAll(async () => {
  owner = await provisionPerson();
  teamMember = await provisionPerson();
  seller = await provisionPerson();
  teamId = await provisionTeam(owner, 'Acme Partners');
  dealId = await newDeal(teamId, owner);

  await admin
    .from('accounts_memberships')
    .insert({
      account_id: teamId,
      user_id: teamMember.userId,
      account_role: 'member',
    })
    .throwOnError();

  const { data } = await owner.client
    .rpc('ensure_seller_room', { deal_id: dealId })
    .throwOnError();
  roomId = data;

  await admin
    .from('seller_room_member')
    .insert({
      room_id: roomId,
      user_id: seller.userId,
      email: seller.email,
      name: 'Sam Seller',
    })
    .throwOnError();

  const { data: room } = await admin
    .from('seller_room')
    .select('uploads_folder_id')
    .eq('id', roomId)
    .single()
    .throwOnError();

  uploaded = crypto.randomUUID();
  await admin
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: 'dr_document',
      p_aggregate_id: uploaded,
      p_event_type: 'dr_document.added',
      p_payload: {
        folder_id: room.uploads_folder_id,
        name: 'lease.pdf',
        storage_path: `deal/${dealId}/${uploaded}`,
        version: 1,
      },
      p_actor_kind: 'service',
    })
    .throwOnError();
});

beforeEach(() => {
  world.signedInClient = owner.client;
  world.outbox = [];
  vi.stubEnv('SELLER_DELIVERY_FROM_EMAIL', 'Deals <deals@odb.test>');
});

afterAll(async () => {
  await cleanUp([teamId]);
});

describe('the room people list', () => {
  it('counts everyone on the team behind the room', async () => {
    expect(await countDealTeam(admin, roomId)).toBe(2);
  });

  it('names the deal owner', async () => {
    await admin
      .from('accounts')
      .update({ name: 'Dana Owner' })
      .eq('primary_owner_user_id', owner.userId)
      .eq('is_personal_account', true)
      .throwOnError();

    expect(await dealOwnerName(admin, dealId)).toBe('Dana Owner');
  });

  it('shows the team each seller in the room', async () => {
    expect(await loadSellerRoomPeople(owner.client, dealId)).toEqual([
      expect.objectContaining({ name: 'Sam Seller', email: seller.email }),
    ]);
  });

  it('shows an analyst each seller by name only', async () => {
    expect(await loadSellerRoomPeople(teamMember.client, dealId)).toEqual([
      expect.objectContaining({ name: 'Sam Seller', email: null }),
    ]);
  });

  it('refuses removal by someone who cannot manage the deal', async () => {
    world.signedInClient = teamMember.client;
    const [person] = await loadSellerRoomPeople(owner.client, dealId);

    expect(await removeSeller({ dealId, memberId: person!.id })).toEqual({
      ok: false,
      refusal: 'You cannot change this seller room.',
    });
  });

  it('removes a seller, emails them, and keeps their uploads', async () => {
    const [person] = await loadSellerRoomPeople(owner.client, dealId);

    expect(await removeSeller({ dealId, memberId: person!.id })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await loadSellerRoomPeople(owner.client, dealId)).toEqual([]);
    expect(world.outbox).toEqual([
      expect.objectContaining({
        to: seller.email,
        from: '"Dana Owner via Open Deal Book" <deals@odb.test>',
        replyTo: owner.email,
        subject: 'You were removed from the room for Seller room deal',
      }),
    ]);

    const { data: kept } = await admin
      .from('dr_document')
      .select('id')
      .eq('id', uploaded)
      .throwOnError();
    expect(kept).toHaveLength(1);
  });
});
