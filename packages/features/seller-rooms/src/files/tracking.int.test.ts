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

const world = vi.hoisted(() => ({ signedInClient: null as unknown }));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => world.signedInClient,
}));

import {
  recordSellerFolderOpened,
  recordSellerRoomOpened,
} from './tracking-actions';

let owner: Person;
let seller: Person;
let stranger: Person;
let teamId: string;
let roomId: string;
let uploadsFolder: string;

async function actions() {
  const { data } = await admin
    .from('seller_room_activity')
    .select('action, dr_folder_id')
    .eq('room_id', roomId)
    .order('created_at')
    .throwOnError();

  return data;
}

beforeAll(async () => {
  owner = await provisionPerson();
  seller = await provisionPerson();
  stranger = await provisionPerson();
  teamId = await provisionTeam(owner, 'Acme Partners');

  const { data } = await owner.client
    .rpc('ensure_seller_room', { deal_id: await newDeal(teamId, owner) })
    .throwOnError();
  roomId = data;

  const { data: room } = await admin
    .from('seller_room')
    .select('uploads_folder_id')
    .eq('id', roomId)
    .single()
    .throwOnError();
  uploadsFolder = room.uploads_folder_id;

  await admin
    .from('seller_room_member')
    .insert({
      room_id: roomId,
      user_id: seller.userId,
      email: seller.email,
      name: 'Sam Seller',
    })
    .throwOnError();
});

beforeEach(() => {
  world.signedInClient = seller.client;
});

afterAll(async () => {
  await cleanUp([teamId]);
});

describe('seller room tracking actions', () => {
  it('records the seller opening the room and a real folder, but not the team side heading', async () => {
    expect(await recordSellerRoomOpened({ roomId })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(
      await recordSellerFolderOpened({ roomId, folderId: uploadsFolder }),
    ).toEqual({
      ok: true,
      value: undefined,
    });
    expect(
      await recordSellerFolderOpened({ roomId, folderId: roomId }),
    ).toEqual({
      ok: true,
      value: undefined,
    });

    expect(await actions()).toEqual([
      { action: 'room_opened', dr_folder_id: null },
      { action: 'folder_opened', dr_folder_id: uploadsFolder },
    ]);
  });

  it('refuses someone who is not in the room', async () => {
    world.signedInClient = stranger.client;

    expect(await recordSellerRoomOpened({ roomId })).toEqual({
      ok: false,
      refusal: 'You do not have access to this room',
    });
  });
});
