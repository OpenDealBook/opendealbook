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
  withLockedTeam,
  type Person,
} from '../test-support/world';

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON_KEY);
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY);
vi.stubEnv('NOVU_API_KEY', 'test-novu-key');
vi.stubEnv('NOVU_API_URL', 'https://novu.test');

const novu = vi.hoisted(() => ({ triggered: [] as Record<string, unknown>[] }));

vi.mock('@odb/notifications/server', () => ({
  createNovuClient: () => ({}),
  triggerNotification: async (
    _deps: unknown,
    input: Record<string, unknown>,
  ) => {
    novu.triggered.push(input);
  },
}));

const world = vi.hoisted(() => ({ signedInClient: null as unknown }));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => world.signedInClient,
}));

import { hideSellerRoomFolder, showSellerRoomFolder } from './actions';
import { loadSellerRoomFolders } from './queries';

let owner: Person;
let teamMember: Person;
let seller: Person;
let teamId: string;

async function folder(
  dealId: string,
  name: string,
  parentId: string | null = null,
) {
  const { data } = await admin
    .from('dr_folder')
    .insert({ account_id: teamId, deal_id: dealId, parent_id: parentId, name })
    .select('id')
    .single()
    .throwOnError();

  return data.id;
}

async function documentIn(dealId: string, folderId: string, name: string) {
  const id = crypto.randomUUID();

  await admin
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: 'dr_document',
      p_aggregate_id: id,
      p_event_type: 'dr_document.added',
      p_payload: {
        folder_id: folderId,
        name,
        storage_path: `deal/${dealId}/${id}`,
        version: 1,
      },
      p_actor_kind: 'service',
    })
    .throwOnError();

  return id;
}

async function admitSeller(dealId: string) {
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
}

async function documentsTheSellerSees() {
  const { data } = await seller.client
    .from('dr_document')
    .select('name')
    .order('name')
    .throwOnError();

  return data.map((row) => row.name);
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
});

afterAll(async () => {
  await cleanUp([teamId]);
});

describe('seller room folders', () => {
  it('shows a folder to the room, and its documents to the seller, until the team hides it', async () => {
    const dealId = await newDeal(teamId, owner);
    const shared = await folder(dealId, 'Financials');
    const teamOnly = await folder(dealId, 'Internal');
    await documentIn(
      dealId,
      await folder(dealId, '2024', shared),
      'p-and-l.pdf',
    );
    await documentIn(dealId, teamOnly, 'notes.pdf');
    await admitSeller(dealId);

    expect(await showSellerRoomFolder({ dealId, folderId: shared })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await documentsTheSellerSees()).toEqual(['p-and-l.pdf']);

    expect(await hideSellerRoomFolder({ dealId, folderId: shared })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await documentsTheSellerSees()).toEqual([]);
  });

  it('lists the deal folders with what the room shows, leaving out the room uploads folder', async () => {
    const dealId = await newDeal(teamId, owner);
    const shared = await folder(dealId, 'Financials');
    const child = await folder(dealId, '2024', shared);
    const teamOnly = await folder(dealId, 'Internal');
    await showSellerRoomFolder({ dealId, folderId: shared });

    const result = await loadSellerRoomFolders(owner.client, dealId);

    expect(result).toEqual(
      expect.arrayContaining([
        { id: shared, parentId: null, name: 'Financials', shown: 'picked' },
        { id: child, parentId: shared, name: '2024', shown: 'with-parent' },
        { id: teamOnly, parentId: null, name: 'Internal', shown: 'hidden' },
        ...['Financials', 'Legal', 'Operations', 'Tax', 'Other'].map((name) => ({
          id: expect.any(String),
          parentId: null,
          name,
          shown: 'hidden',
        })),
      ]),
    );
    expect(result).toHaveLength(8);
  });

  it('refuses a team member who cannot manage the deal', async () => {
    const dealId = await newDeal(teamId, owner);
    const shared = await folder(dealId, 'Financials');
    world.signedInClient = teamMember.client;

    expect(await showSellerRoomFolder({ dealId, folderId: shared })).toEqual({
      ok: false,
      refusal: 'You cannot change this seller room.',
    });
  });

  it('refuses a folder from another deal', async () => {
    const dealId = await newDeal(teamId, owner);
    const elsewhere = await folder(await newDeal(teamId, owner), 'Elsewhere');

    expect(await showSellerRoomFolder({ dealId, folderId: elsewhere })).toEqual(
      {
        ok: false,
        refusal: 'That folder is not in this deal.',
      },
    );
  });

  it('refuses a locked team up front', async () => {
    const dealId = await newDeal(teamId, owner);
    const shared = await folder(dealId, 'Financials');

    await withLockedTeam(teamId, async () => {
      expect(await showSellerRoomFolder({ dealId, folderId: shared })).toEqual({
        ok: false,
        refusal: 'This team is read-only until billing is updated.',
      });
    });
  });

  it('refuses a lender room folder or a folder under the lender package, and leaves them out of the list', async () => {
    const dealId = await newDeal(teamId, owner);
    const lenderPrivate = await folder(dealId, 'Bank room');
    const packageRoot = await folder(dealId, 'Lender package');
    const underPackage = await folder(dealId, 'Tax returns', packageRoot);

    await admin
      .from('lender_package')
      .insert({
        deal_id: dealId,
        account_id: teamId,
        master_folder_id: packageRoot,
      })
      .throwOnError();
    await admin
      .from('lender_room')
      .insert({
        account_id: teamId,
        deal_id: dealId,
        name: 'Bank',
        private_folder_id: lenderPrivate,
      })
      .throwOnError();

    for (const folderId of [lenderPrivate, underPackage]) {
      expect(await showSellerRoomFolder({ dealId, folderId })).toEqual({
        ok: false,
        refusal: 'Lender folders cannot be shown to sellers.',
      });
    }

    const listed = (await loadSellerRoomFolders(owner.client, dealId)).map(
      (listedFolder) => listedFolder.id,
    );
    expect(listed).not.toContain(lenderPrivate);
    expect(listed).not.toContain(packageRoot);
    expect(listed).not.toContain(underPackage);
  });

  it('refuses the Buyer\'s counsel folder or a folder inside it, and the seller sees none of it', async () => {
    const dealId = await newDeal(teamId, owner);
    const { data: counselFolder } = await admin
      .rpc('ensure_counsel_uploads_folder', { deal_id: dealId })
      .throwOnError();
    const markups = await folder(dealId, 'Markups', counselFolder);
    await documentIn(dealId, markups, 'redline.docx');
    await admitSeller(dealId);

    for (const folderId of [counselFolder, markups]) {
      expect(await showSellerRoomFolder({ dealId, folderId })).toEqual({
        ok: false,
        refusal: 'Counsel folders cannot be shown to sellers.',
      });
    }
    expect(await documentsTheSellerSees()).toEqual([]);

    const listed = (await loadSellerRoomFolders(owner.client, dealId)).map(
      (listedFolder) => listedFolder.id,
    );
    expect(listed).not.toContain(counselFolder);
    expect(listed).not.toContain(markups);
  });

  it('queues a newly shown folder for each seller daily digest once, even if hidden and shown again', async () => {
    const dealId = await newDeal(teamId, owner);
    const shared = await folder(dealId, 'Financials');
    await admitSeller(dealId);
    novu.triggered = [];

    await showSellerRoomFolder({ dealId, folderId: shared });
    await showSellerRoomFolder({ dealId, folderId: shared });
    await hideSellerRoomFolder({ dealId, folderId: shared });
    await showSellerRoomFolder({ dealId, folderId: shared });

    const { data: room } = await admin
      .from('seller_room')
      .select('id')
      .eq('deal_id', dealId)
      .single()
      .throwOnError();

    expect(novu.triggered).toEqual([
      expect.objectContaining({
        eventType: 'seller-room-shared',
        recipientUserId: seller.userId,
        payload: { kind: 'folder', roomId: room.id, folderId: shared },
      }),
    ]);
  });
});
