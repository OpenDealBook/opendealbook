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
vi.stubEnv('NOVU_API_KEY', 'test-novu-key');
vi.stubEnv('NOVU_API_URL', 'https://novu.test');

const world = vi.hoisted(() => ({
  signedInClient: null as unknown,
  triggered: [] as unknown[],
}));

vi.mock('@odb/notifications/server', () => ({
  createNovuClient: () => ({}),
  triggerNotification: async (_context: unknown, event: unknown) => {
    world.triggered.push(event);
  },
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => world.signedInClient,
}));

const {
  admin,
  cleanUp,
  newDeal,
  provisionPerson,
  provisionTeam,
  withLockedTeam,
} = await import('@odb/seller-rooms/test-support/world.ts');
const { beginUpload, registerUpload } =
  await import('@odb/lender-rooms/uploads/actions.ts');
const { createFolder } =
  await import('@odb/lender-rooms/uploads/folder-actions.ts');
const { openBuyerCounselUploads } = await import('./uploads');

type Person = Awaited<ReturnType<typeof provisionPerson>>;

let owner: Person;
let buyerCounsel: Person;
let sellerCounsel: Person;
let teamId: string;
let dealId: string;
let teamFolder: string;

async function counselFolder(): Promise<string> {
  const opened = await openBuyerCounselUploads({ dealId });

  if (!opened.ok) {
    throw new Error(opened.refusal);
  }

  return opened.value;
}

beforeAll(async () => {
  owner = await provisionPerson();
  buyerCounsel = await provisionPerson();
  sellerCounsel = await provisionPerson();
  teamId = await provisionTeam(owner, 'Acme Partners');
  dealId = await newDeal(teamId, owner);

  await admin
    .from('deal_counsel')
    .insert([
      {
        account_id: teamId,
        deal_id: dealId,
        side: 'buyer',
        user_id: buyerCounsel.userId,
        email: buyerCounsel.email,
        name: 'Bea Buyerlaw',
      },
      {
        account_id: teamId,
        deal_id: dealId,
        side: 'seller',
        user_id: sellerCounsel.userId,
        email: sellerCounsel.email,
      },
    ])
    .throwOnError();

  const { data: folder } = await admin
    .from('dr_folder')
    .insert({ account_id: teamId, deal_id: dealId, name: 'Financials' })
    .select('id')
    .single()
    .throwOnError();
  teamFolder = folder.id;
});

beforeEach(() => {
  world.signedInClient = buyerCounsel.client;
});

afterAll(async () => {
  await cleanUp([teamId]);
});

describe("buyer's counsel uploads", () => {
  it("adds a file to the Buyer's counsel root folder, made on first upload", async () => {
    const folderId = await counselFolder();

    const begun = await beginUpload({
      counselDealId: dealId,
      folderId,
      name: 'redline.pdf',
      size: 9,
    });

    if (!begun.ok) {
      throw new Error(begun.refusal);
    }

    await admin.storage
      .from('data-room')
      .uploadToSignedUrl(
        begun.value.path,
        begun.value.token,
        new TextEncoder().encode('%PDF-1.4\n'),
      );

    const registered = await registerUpload({
      uploadId: begun.value.uploadId,
      keepAsZip: false,
    });

    expect(registered.ok).toBe(true);

    const { data: documents } = await buyerCounsel.client
      .rpc('buyer_counsel_documents', { deal_id: dealId })
      .throwOnError();
    const { data: folders } = await buyerCounsel.client
      .rpc('buyer_counsel_folders', { deal_id: dealId })
      .throwOnError();

    expect(
      documents.map((document) => ({
        name: document.name,
        folder: folders.find((folder) => folder.id === document.folder_id)
          ?.name,
        uploadedBy: document.uploaded_by,
      })),
    ).toEqual([
      {
        name: 'redline.pdf',
        folder: "Buyer's counsel",
        uploadedBy: buyerCounsel.userId,
      },
    ]);
    expect(
      folders.find((folder) => folder.id === folderId)?.parent_id,
    ).toBeNull();
    expect(world.triggered).toEqual([
      expect.objectContaining({
        eventType: 'counsel-uploads',
        recipientUserId: owner.userId,
        payload: { dealId, line: 'Bea Buyerlaw uploaded redline.pdf' },
      }),
    ]);
  });

  it('lets counsel make a subfolder and upload into it', async () => {
    const created = await createFolder({
      counselDealId: dealId,
      parentFolderId: await counselFolder(),
      name: 'Redlines',
    });

    if (!created.ok) {
      throw new Error(created.refusal);
    }

    expect(
      (
        await beginUpload({
          counselDealId: dealId,
          folderId: created.value,
          name: 'markup.docx',
          size: 9,
        })
      ).ok,
    ).toBe(true);
  });

  it("refuses a file anywhere outside the Buyer's counsel folder", async () => {
    expect(
      await beginUpload({
        counselDealId: dealId,
        folderId: teamFolder,
        name: 'redline.pdf',
        size: 9,
      }),
    ).toEqual({
      ok: false,
      refusal: "Files can only be added to the Buyer's counsel folder",
    });
  });

  it("refuses seller's counsel", async () => {
    world.signedInClient = sellerCounsel.client;

    expect(await openBuyerCounselUploads({ dealId })).toEqual({
      ok: false,
      refusal: 'You do not have access to this deal',
    });
  });

  it("refuses a folder past the Buyer's counsel folder's limit of 5,000", async () => {
    const folderId = await counselFolder();
    const { count } = await admin
      .from('dr_folder')
      .select('id', { count: 'exact', head: true })
      .eq('parent_id', folderId)
      .throwOnError();

    for (let made = count ?? 0; made < 5000; made += 1000) {
      await admin
        .from('dr_folder')
        .insert(
          Array.from({ length: Math.min(1000, 5000 - made) }, (_, index) => ({
            account_id: teamId,
            deal_id: dealId,
            parent_id: folderId,
            name: `filler ${made + index}`,
          })),
        )
        .throwOnError();
    }

    expect(
      await createFolder({
        counselDealId: dealId,
        parentFolderId: folderId,
        name: 'One more',
      }),
    ).toEqual({
      ok: false,
      refusal:
        "The Buyer's counsel folder has reached its limit of 5,000 folders",
    });

    await admin
      .from('dr_folder')
      .delete()
      .like('name', 'filler %')
      .eq('parent_id', folderId)
      .throwOnError();
  }, 120_000);

  it('refuses while the team is locked', async () => {
    const folderId = await counselFolder();

    await withLockedTeam(teamId, async () => {
      expect(
        await beginUpload({
          counselDealId: dealId,
          folderId,
          name: 'redline.pdf',
          size: 9,
        }),
      ).toEqual({
        ok: false,
        refusal: 'This team is read-only until billing is updated.',
      });
    });
  });
});
