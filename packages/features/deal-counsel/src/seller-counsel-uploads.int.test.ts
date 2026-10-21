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
const world = vi.hoisted(() => ({ signedInClient: null as unknown }));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => world.signedInClient,
}));

const { admin, cleanUp, provisionPerson, provisionTeam, withLockedTeam } =
  await import('@odb/seller-rooms/test-support/world.ts');
const { beginUpload, registerUpload } =
  await import('@odb/lender-rooms/uploads/actions.ts');
const { createFolder } =
  await import('@odb/lender-rooms/uploads/folder-actions.ts');
const { respondToSellerCounselFolderDocumentRequest } =
  await import('./documents.ts');
const { loadSellerCounselFolder } = await import('./seller-counsel-folder.ts');
const { loadSellerRoomFolders } =
  await import('@odb/seller-rooms/folders/queries.ts');

type Person = Awaited<ReturnType<typeof provisionPerson>>;

let owner: Person;
let dealId: string;
let seller: Person;
let sellerCounsel: Person;
let teamId: string;
let roomId: string;
let uploadsFolder: string;

async function uploadInto(
  begun: Awaited<ReturnType<typeof beginUpload>>,
): Promise<string[]> {
  if (!begun.ok) {
    throw new Error(begun.refusal);
  }

  const { error } = await admin.storage
    .from('data-room')
    .uploadToSignedUrl(begun.value.path, begun.value.token, new Blob(['x']));

  if (error) {
    throw error;
  }

  const registered = await registerUpload({
    uploadId: begun.value.uploadId,
    keepAsZip: false,
  });

  if (!registered.ok) {
    throw new Error(registered.refusal);
  }

  return registered.value;
}

function uploadInUploads(name: string): Promise<string[]> {
  return beginInUploads(name).then(uploadInto);
}

async function sellerCounselFolderId(): Promise<string> {
  const { data } = await admin
    .from('seller_counsel_folder')
    .select('folder_id')
    .eq('deal_id', dealId)
    .single()
    .throwOnError();

  return data.folder_id;
}

async function beginInSellerCounselFolder(name: string) {
  return beginUpload({
    sellerCounselDealId: dealId,
    folderId: await sellerCounselFolderId(),
    name,
    size: 9,
  });
}

async function archive(eventType: 'deal.archived' | 'deal.unarchived') {
  await admin
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: 'deal',
      p_aggregate_id: dealId,
      p_event_type: eventType,
      p_actor_kind: 'service',
    })
    .throwOnError();
}

function beginInUploads(name: string) {
  return beginUpload({
    sellerRoomId: roomId,
    folderId: uploadsFolder,
    name,
    size: 9,
  });
}

beforeAll(async () => {
  owner = await provisionPerson();
  seller = await provisionPerson();
  sellerCounsel = await provisionPerson();
  teamId = await provisionTeam(owner, 'Acme Partners');
  const { data: firm } = await admin
    .from('firm')
    .insert({ account_id: teamId, name: 'Brennan Tooling' })
    .select('id')
    .single()
    .throwOnError();
  dealId = crypto.randomUUID();
  await admin
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: 'deal',
      p_aggregate_id: dealId,
      p_event_type: 'deal.created',
      p_payload: {
        account_id: teamId,
        owner_user_id: owner.userId,
        firm_id: firm.id,
        description: 'Tooling shop',
      },
      p_actor_kind: 'service',
    })
    .throwOnError();

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

  await admin
    .from('seller_room_member')
    .insert({
      room_id: roomId,
      user_id: seller.userId,
      email: seller.email,
      name: 'Walt Brennan',
    })
    .throwOnError();
  await admin
    .from('deal_counsel')
    .insert({
      account_id: teamId,
      deal_id: dealId,
      side: 'seller',
      user_id: sellerCounsel.userId,
      email: sellerCounsel.email,
      name: 'Owen Castillo',
      invited_by: seller.userId,
    })
    .throwOnError();
});

beforeEach(() => {
  world.signedInClient = sellerCounsel.client;
});

afterAll(async () => {
  await cleanUp([teamId]);
});

describe("seller's counsel uploads into the seller room", () => {
  it("lets seller's counsel start an upload into the room's uploads", async () => {
    const begun = await beginInUploads('redline.pdf');

    expect(begun.ok).toBe(true);
  });

  it('labels the upload as made for the seller and tells the deal managers', async () => {
    const [documentId] = await uploadInUploads('side-letter.pdf');

    const [{ data: activity }, { data: notices }] = await Promise.all([
      admin
        .from('seller_room_activity')
        .select('side, user_id')
        .eq('dr_document_id', documentId!)
        .throwOnError(),
      admin
        .from('notifications')
        .select('body')
        .eq('recipient_user_id', owner.userId)
        .eq('deal_id', dealId)
        .throwOnError(),
    ]);

    expect(activity).toEqual([
      { side: 'seller', user_id: sellerCounsel.userId },
    ]);
    expect(notices.map((notice) => notice.body)).toContain(
      'Uploaded by Owen Castillo for Walt Brennan: side-letter.pdf',
    );
  });

  it('names the seller generically once the seller who invited counsel has left', async () => {
    const formerSeller = await provisionPerson();
    const otherCounsel = await provisionPerson();
    await admin
      .from('deal_counsel')
      .insert({
        account_id: teamId,
        deal_id: dealId,
        side: 'seller',
        user_id: otherCounsel.userId,
        email: otherCounsel.email,
        name: 'Rita Ruiz',
        invited_by: formerSeller.userId,
      })
      .throwOnError();
    world.signedInClient = otherCounsel.client;

    await uploadInUploads('estoppel.pdf');

    const { data: notices } = await admin
      .from('notifications')
      .select('body')
      .eq('recipient_user_id', owner.userId)
      .eq('deal_id', dealId)
      .throwOnError();

    expect(notices.map((notice) => notice.body)).toContain(
      'Uploaded by Rita Ruiz for the seller: estoppel.pdf',
    );
  });

  it("records a folder seller's counsel make as made on the seller's side", async () => {
    const made = await createFolder({
      sellerRoomId: roomId,
      parentFolderId: uploadsFolder,
      name: 'Redlines',
    });

    if (!made.ok) {
      throw new Error(made.refusal);
    }

    const { data: activity } = await admin
      .from('seller_room_activity')
      .select('side')
      .eq('dr_folder_id', made.value)
      .eq('action', 'folder_created')
      .throwOnError();

    expect(activity).toEqual([{ side: 'seller' }]);
  });

  it("refuses seller's counsel while the team is locked, and keeps the seller unblocked", async () => {
    await withLockedTeam(teamId, async () => {
      expect(await beginInUploads('redline.pdf')).toEqual({
        ok: false,
        refusal: 'This team is read-only until billing is updated.',
      });

      world.signedInClient = seller.client;

      expect((await beginInUploads('lease.pdf')).ok).toBe(true);
    });
  });
});

describe("the Seller's counsel folder", () => {
  it('is never offered to the team for the seller room', async () => {
    const offered = await loadSellerRoomFolders(owner.client, dealId);

    expect(offered.map((folder) => folder.name)).not.toContain(
      "Seller's counsel",
    );
  });
});

describe("uploads into the Seller's counsel folder", () => {
  it("lets seller's counsel add a file the seller sees and the buyer team does not", async () => {
    const [documentId] = await uploadInto(
      await beginInSellerCounselFolder('draft-reps.pdf'),
    );

    const [asSeller, asTeam] = await Promise.all([
      seller.client.from('dr_document').select('name').eq('id', documentId!),
      owner.client.from('dr_document').select('name').eq('id', documentId!),
    ]);

    expect(asSeller.data).toEqual([{ name: 'draft-reps.pdf' }]);
    expect(asTeam.data).toEqual([]);
  });

  it('opens a file there for the seller side only', async () => {
    const [documentId] = await uploadInto(
      await beginInSellerCounselFolder('disclosure.pdf'),
    );
    const open = (person: Person) =>
      respondToSellerCounselFolderDocumentRequest({
        client: person.client,
        admin,
        request: new Request(
          `http://app.test/counsel/${dealId}/seller-room/files/${documentId}?disposition=download`,
        ),
        dealId,
        documentId: documentId!,
      });

    expect((await open(sellerCounsel)).status).toBe(307);
    expect((await open(seller)).status).toBe(307);
    expect((await open(owner)).status).toBe(404);
  });

  it("lists the folder's files for the seller side and nothing for the team", async () => {
    await uploadInto(await beginInSellerCounselFolder('schedule.pdf'));

    const asSeller = await loadSellerCounselFolder(seller.client, dealId);
    const asTeam = await loadSellerCounselFolder(owner.client, dealId);

    expect(asSeller!.files.map((file) => file.name)).toContain('schedule.pdf');
    expect(asTeam!.files).toEqual([]);
  });

  it('lets the seller side make a subfolder, upload into it, and keep it from the team', async () => {
    const made = await createFolder({
      sellerCounselDealId: dealId,
      parentFolderId: await sellerCounselFolderId(),
      name: 'Disclosure drafts',
    });

    if (!made.ok) {
      throw new Error(made.refusal);
    }

    await uploadInto(
      await beginUpload({
        sellerCounselDealId: dealId,
        folderId: made.value,
        name: 'schedule-4.pdf',
        size: 9,
      }),
    );

    const asSeller = await loadSellerCounselFolder(seller.client, dealId);
    const asTeam = await owner.client
      .from('dr_folder')
      .select('id')
      .eq('id', made.value);

    expect(asSeller!.folders).toContainEqual({
      id: made.value,
      path: "Seller's counsel / Disclosure drafts",
    });
    expect(asSeller!.files.map((file) => file.name)).toContain(
      'schedule-4.pdf',
    );
    expect(asTeam.data).toEqual([]);
  });

  it('lets the seller add a file there too', async () => {
    world.signedInClient = seller.client;

    expect(
      (await uploadInto(await beginInSellerCounselFolder('notes.pdf'))).length,
    ).toBe(1);
  });

  it('refuses the buyer team', async () => {
    world.signedInClient = owner.client;

    expect(await beginInSellerCounselFolder('peek.pdf')).toEqual({
      ok: false,
      refusal: 'You do not have access to this deal',
    });
  });

  it("refuses seller's counsel once the deal has ended, saying why", async () => {
    await archive('deal.archived');

    const begun = await beginInSellerCounselFolder('late.pdf');

    await archive('deal.unarchived');
    expect(begun).toEqual({
      ok: false,
      refusal: 'This deal has closed, so everything here is read-only.',
    });
  });

  it("refuses the seller in the Seller's counsel folder once the deal has ended, saying why", async () => {
    world.signedInClient = seller.client;
    await archive('deal.archived');

    const begun = await beginInSellerCounselFolder('late.pdf');

    await archive('deal.unarchived');
    expect(begun).toEqual({
      ok: false,
      refusal: 'This deal has closed, so everything here is read-only.',
    });
  });
});
