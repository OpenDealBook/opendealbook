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

import {
  beginUpload,
  registerUpload,
} from '@odb/lender-rooms/uploads/actions.ts';
import { createFolder } from '@odb/lender-rooms/uploads/folder-actions.ts';

let owner: Person;
let seller: Person;
let stranger: Person;
let teamId: string;
let dealId: string;
let roomId: string;
let uploadsFolder: string;
let pickedFolder: string;

async function upload(
  folderId: string,
  name: string,
  bytes = 'pdf bytes',
): Promise<{ ok: boolean; refusal?: string; documentIds?: string[] }> {
  const begun = await beginUpload({
    sellerRoomId: roomId,
    folderId,
    name,
    size: bytes.length,
  });

  if (!begun.ok) {
    return begun;
  }

  await admin.storage
    .from('data-room')
    .uploadToSignedUrl(begun.value.path, begun.value.token, new Blob([bytes]))
    .then(({ error }) => {
      if (error) throw error;
    });

  const registered = await registerUpload({
    uploadId: begun.value.uploadId,
    keepAsZip: false,
  });

  return registered.ok
    ? { ok: true, documentIds: registered.value }
    : registered;
}

beforeAll(async () => {
  owner = await provisionPerson();
  seller = await provisionPerson();
  stranger = await provisionPerson();
  teamId = await provisionTeam(owner, 'Acme Partners');
  dealId = await newDeal(teamId, owner);

  const { data } = await owner.client
    .rpc('ensure_seller_room', { deal_id: dealId })
    .throwOnError();
  roomId = data;

  const { data: room } = await admin
    .from('seller_room')
    .select('uploads_folder_id')
    .eq('id', roomId)
    .single()
    .throwOnError();
  uploadsFolder = room.uploads_folder_id;

  const { data: picked } = await admin
    .from('dr_folder')
    .insert({ account_id: teamId, deal_id: dealId, name: 'Financials' })
    .select('id')
    .single()
    .throwOnError();
  pickedFolder = picked.id;

  await admin
    .from('seller_room_folder')
    .insert({ room_id: roomId, dr_folder_id: pickedFolder })
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
});

beforeEach(() => {
  world.signedInClient = seller.client;
});

afterAll(async () => {
  await cleanUp([teamId]);
});

describe('seller uploads', () => {
  it('adds a seller file to the room uploads, records it, and tells the team', async () => {
    const result = await upload(uploadsFolder, 'lease.pdf');

    expect(result.ok).toBe(true);

    const { data: documents } = await seller.client
      .from('dr_document')
      .select('id, name, folder_id')
      .eq('folder_id', uploadsFolder)
      .throwOnError();

    expect(documents).toEqual([
      {
        id: result.documentIds![0],
        name: 'lease.pdf',
        folder_id: uploadsFolder,
      },
    ]);

    const { data: activity } = await admin
      .from('seller_room_activity')
      .select('user_id, side, action, dr_document_id')
      .eq('room_id', roomId)
      .eq('action', 'document_uploaded')
      .throwOnError();

    expect(activity).toEqual([
      {
        user_id: seller.userId,
        side: 'seller',
        action: 'document_uploaded',
        dr_document_id: result.documentIds![0],
      },
    ]);

    const { data: notices } = await admin
      .from('notifications')
      .select('body, deal_id, link')
      .eq('account_id', teamId)
      .eq('recipient_user_id', owner.userId)
      .like('body', '%lease.pdf%')
      .throwOnError();
    const { data: team } = await admin
      .from('accounts')
      .select('slug')
      .eq('id', teamId)
      .single()
      .throwOnError();

    expect(notices).toEqual([
      {
        body: 'Sam Seller uploaded lease.pdf',
        deal_id: dealId,
        link: `/deal-windows/${team.slug}/${dealId}/data-room/view?doc=${result.documentIds![0]}`,
      },
    ]);
    expect(novu.triggered).toContainEqual(
      expect.objectContaining({
        eventType: 'seller-room-activity',
        recipientUserId: owner.userId,
        payload: { roomId, line: 'Sam Seller uploaded lease.pdf' },
      }),
    );
  });

  it('lets the seller make a folder inside Uploads and upload into it', async () => {
    const folder = await createFolder({
      sellerRoomId: roomId,
      parentFolderId: uploadsFolder,
      name: 'Leases',
    });

    expect(folder.ok).toBe(true);

    const { data: recorded } = await admin
      .from('seller_room_activity')
      .select('user_id, side, action, dr_folder_id')
      .eq('room_id', roomId)
      .eq('action', 'folder_created')
      .throwOnError();

    expect(recorded).toEqual([
      {
        user_id: seller.userId,
        side: 'seller',
        action: 'folder_created',
        dr_folder_id: folder.ok ? folder.value : null,
      },
    ]);
    expect((await upload(folder.ok ? folder.value : '', 'unit-4.pdf')).ok).toBe(
      true,
    );
  });

  it('refuses an upload into a folder the team shares', async () => {
    expect(await upload(pickedFolder, 'sneaky.pdf')).toEqual({
      ok: false,
      refusal: "Files can only be added to the room's uploads",
    });
  });

  it('refuses video and audio like lender rooms', async () => {
    expect(await upload(uploadsFolder, 'walkthrough.mp4')).toEqual({
      ok: false,
      refusal:
        'walkthrough.mp4 cannot be uploaded: video and audio files are not allowed',
    });
  });

  it('refuses someone who is not in the room', async () => {
    world.signedInClient = stranger.client;

    expect(await upload(uploadsFolder, 'lease.pdf')).toEqual({
      ok: false,
      refusal: 'You do not have access to this room',
    });
  });

  it('lets the deal team add files and folders to Uploads, recorded as the team, without a notice', async () => {
    world.signedInClient = owner.client;

    const folder = await createFolder({
      sellerRoomId: roomId,
      parentFolderId: uploadsFolder,
      name: 'From the team',
    });
    const uploaded = await upload(uploadsFolder, 'team-note.pdf');

    expect(folder.ok).toBe(true);
    expect(uploaded.ok).toBe(true);

    const { data: activity } = await admin
      .from('seller_room_activity')
      .select('user_id, side, action')
      .eq('room_id', roomId)
      .eq('user_id', owner.userId)
      .order('created_at')
      .throwOnError();

    expect(activity).toEqual([
      { user_id: owner.userId, side: 'internal', action: 'folder_created' },
      { user_id: owner.userId, side: 'internal', action: 'document_uploaded' },
    ]);

    const { data: notices } = await admin
      .from('notifications')
      .select('body')
      .eq('account_id', teamId)
      .like('body', '%team-note.pdf%')
      .throwOnError();

    expect(notices).toEqual([]);
  });

  it('refuses a seller upload once the room closes, saying why', async () => {
    await admin
      .from('seller_room')
      .update({ closed_at: new Date().toISOString() })
      .eq('id', roomId)
      .throwOnError();

    const begun = await beginUpload({
      sellerRoomId: roomId,
      folderId: uploadsFolder,
      name: 'late.pdf',
      size: 9,
    });

    await admin
      .from('seller_room')
      .update({ closed_at: null })
      .eq('id', roomId)
      .throwOnError();
    expect(begun).toEqual({
      ok: false,
      refusal: 'The seller room is closed, so this is read-only.',
    });
  });
});
