import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { DATA_ROOM_BUCKET } from '@odb/data-room/storage';

import {
  type IntegrationAccount,
  provisionAccount,
} from '../../../../../../../../packages/features/deals/test-support/integration-harness';

const requestClients = vi.hoisted(() => ({
  client: null as unknown,
  admin: null as unknown,
}));

vi.mock('@odb/supabase/server', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getSupabaseServerClient: () => requestClients.client,
}));

vi.mock('@odb/supabase/admin', () => ({
  getSupabaseServerAdminClient: () => requestClients.admin,
}));

import { GET } from './files/[documentId]/route';
import { loadWindowDeal } from './view/window-deal';
import { loadWindowFolders } from './view/window-folders';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

let owner: IntegrationAccount;
let analyst: IntegrationAccount;
let lender: IntegrationAccount;
let seller: IntegrationAccount;
let ownerSlug: string;
let sellerUpload: { id: string; body: string };
let admin: IntegrationAccount['admin'];
let dealId: string;
let financialsId: string;
let bankId: string;
let counselFolderId: string;
let roomId: string;
let pnl: { id: string; body: string };
let lease: { id: string; body: string; storagePath: string };
let memo: { id: string; body: string; storagePath: string };
let statement: { id: string; body: string };
let counselMemo: { id: string; body: string };
const storedPaths: string[] = [];

async function addFolder(name: string, parentId?: string): Promise<string> {
  const { data } = await owner.user
    .from('dr_folder')
    .insert({
      account_id: owner.accountId,
      deal_id: dealId,
      name,
      parent_id: parentId,
    })
    .select('id')
    .single()
    .throwOnError();

  return data.id;
}

async function addDocument(folderId: string, name: string) {
  const id = crypto.randomUUID();
  const storagePath = `deal/${dealId}/${crypto.randomUUID()}`;
  const body = `bytes of ${name} ${id}`;

  await admin
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: 'dr_document',
      p_aggregate_id: id,
      p_event_type: 'dr_document.added',
      p_payload: {
        folder_id: folderId,
        name,
        storage_path: storagePath,
        version: 1,
      },
      p_actor_kind: 'service',
    })
    .throwOnError();
  const { error } = await admin.storage
    .from(DATA_ROOM_BUCKET)
    .upload(storagePath, new Blob([body]));
  if (error) {
    throw error;
  }
  storedPaths.push(storagePath);

  return { id, body, storagePath };
}

function signedInAs(account: IntegrationAccount) {
  requestClients.client = account.user;
  requestClients.admin = admin;
}

function open(documentId: string, disposition = 'preview') {
  return GET(
    new Request(
      `http://odb.test/deal-windows/${ownerSlug}/${dealId}/data-room/files/${documentId}?disposition=${disposition}`,
    ),
    {
      params: Promise.resolve({
        locale: 'en',
        account: ownerSlug,
        id: dealId,
        documentId,
      }),
    },
  );
}

function namesIn(
  folders: Awaited<ReturnType<typeof loadWindowFolders>>,
): string[] {
  return folders.flatMap((folder) => [
    folder.name,
    ...folder.files.map((file) => file.name),
    ...namesIn(folder.folders),
  ]);
}

beforeAll(async () => {
  [owner, analyst] = await Promise.all([
    provisionAccount(),
    provisionAccount(),
  ]);
  admin = owner.admin;
  dealId = crypto.randomUUID();

  await admin
    .from('accounts_memberships')
    .insert({
      account_id: owner.accountId,
      user_id: analyst.userId,
      account_role: 'analyst',
    })
    .throwOnError();
  const { data: firm } = await admin
    .from('firm')
    .insert({ account_id: owner.accountId, name: 'Brennan Tooling' })
    .select('id')
    .single()
    .throwOnError();
  await owner.user
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: 'deal',
      p_aggregate_id: dealId,
      p_event_type: 'deal.created',
      p_payload: {
        account_id: owner.accountId,
        owner_user_id: owner.userId,
        firm_id: firm.id,
        description: 'Data room window deal',
      },
    })
    .throwOnError();

  financialsId = await addFolder('Financials');
  bankId = await addFolder('Bank statements', financialsId);
  pnl = await addDocument(financialsId, 'P&L.xlsx');
  const legalId = await addFolder('Legal');
  lease = await addDocument(legalId, 'Lease.docx');
  memo = await addDocument(legalId, 'Memo.docx');
  const { error: renditionError } = await admin.storage
    .from(DATA_ROOM_BUCKET)
    .upload(`${lease.storagePath}.preview.pdf`, new Blob(['%PDF-1.7 lease']));
  if (renditionError) {
    throw renditionError;
  }
  storedPaths.push(`${lease.storagePath}.preview.pdf`);
  statement = await addDocument(bankId, 'March.pdf');

  const { data: counselFolder } = await admin
    .from('dr_folder')
    .insert({
      account_id: owner.accountId,
      deal_id: dealId,
      name: "Seller's counsel",
    })
    .select('id')
    .single()
    .throwOnError();
  counselFolderId = counselFolder.id;
  await admin
    .from('seller_counsel_folder')
    .insert({
      deal_id: dealId,
      account_id: owner.accountId,
      folder_id: counselFolderId,
    })
    .throwOnError();
  counselMemo = await addDocument(counselFolderId, 'Disclosure memo.docx');

  const roomFolderId = await addFolder('Room private');
  await admin
    .from('lender_package')
    .insert({
      deal_id: dealId,
      account_id: owner.accountId,
      master_folder_id: financialsId,
    })
    .throwOnError();
  const { data: room } = await admin
    .from('lender_room')
    .insert({
      account_id: owner.accountId,
      deal_id: dealId,
      name: 'First Bank & Trust',
      private_folder_id: roomFolderId,
    })
    .select('id')
    .single()
    .throwOnError();
  roomId = room.id;

  [lender, seller] = await Promise.all([
    provisionAccount(),
    provisionAccount(),
  ]);
  const emailOf = async (account: IntegrationAccount) =>
    (await admin.auth.admin.getUserById(account.userId)).data.user!.email!;
  await admin
    .from('lender_room_member')
    .insert({
      room_id: roomId,
      user_id: lender.userId,
      email: await emailOf(lender),
      invited_by: owner.userId,
    })
    .throwOnError();
  const { data: sellerRoomId } = await owner.user
    .rpc('ensure_seller_room', { deal_id: dealId })
    .throwOnError();
  const { data: sellerRoom } = await admin
    .from('seller_room')
    .select('uploads_folder_id')
    .eq('id', sellerRoomId)
    .single()
    .throwOnError();
  await admin
    .from('seller_room_member')
    .insert({
      room_id: sellerRoomId,
      user_id: seller.userId,
      email: await emailOf(seller),
      name: 'Walt Brennan',
    })
    .throwOnError();
  sellerUpload = await addDocument(
    sellerRoom.uploads_folder_id,
    'Tax return.pdf',
  );

  const { data: ownerAccount } = await admin
    .from('accounts')
    .select('slug')
    .eq('id', owner.accountId)
    .single()
    .throwOnError();
  ownerSlug = ownerAccount.slug!;
});

afterAll(async () => {
  await admin.storage.from(DATA_ROOM_BUCKET).remove(storedPaths);
  await Promise.all([
    owner.cleanup(),
    analyst.cleanup(),
    lender.cleanup(),
    seller.cleanup(),
  ]);
});

describe('data room window deal', () => {
  it('finds a deal of the team in the address', async () => {
    await expect(
      loadWindowDeal(owner.user, owner.accountId, dealId),
    ).resolves.toEqual({ firm: { name: 'Brennan Tooling' } });
  });

  it('is not found for a deal id that does not exist', async () => {
    await expect(
      loadWindowDeal(owner.user, owner.accountId, crypto.randomUUID()),
    ).rejects.toMatchObject({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' });
  });

  it('is not found for a deal of another team', async () => {
    await expect(
      loadWindowDeal(analyst.user, analyst.accountId, dealId),
    ).rejects.toMatchObject({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' });
  });
});

describe('data room window folders', () => {
  it.each([
    ['the owner', () => owner],
    ['an analyst', () => analyst],
  ])('shows %s the team folders and files, nested', async (_, who) => {
    const folders = await loadWindowFolders(who().user, dealId);
    const financials = folders.find((folder) => folder.id === financialsId)!;

    expect(financials.files.map((file) => file.name)).toEqual(['P&L.xlsx']);
    expect(financials.folders).toMatchObject([
      { id: bankId, files: [{ id: statement.id, name: 'March.pdf' }] },
    ]);
  });

  it.each([
    ['the owner', () => owner],
    ['an analyst', () => analyst],
  ])(
    "never shows %s the seller's counsel folder or its files",
    async (_, who) => {
      const names = namesIn(await loadWindowFolders(who().user, dealId));

      expect(names).not.toContain("Seller's counsel");
      expect(names).not.toContain('Disclosure memo.docx');
    },
  );
});

describe('data room window file route', () => {
  it('previews a Word file through its PDF rendition', async () => {
    signedInAs(owner);

    const response = await open(lease.id);

    expect(await (await fetch(response.headers.get('location')!)).text()).toBe(
      '%PDF-1.7 lease',
    );
  });

  it('previews a Word file with no rendition as the Word file, without making one', async () => {
    signedInAs(owner);

    const response = await open(memo.id);

    expect(await (await fetch(response.headers.get('location')!)).text()).toBe(
      memo.body,
    );
    expect(
      (
        await admin.storage
          .from(DATA_ROOM_BUCKET)
          .exists(`${memo.storagePath}.preview.pdf`)
      ).data,
    ).toBe(false);
  });

  it('downloads the Word file itself, not its rendition', async () => {
    signedInAs(owner);

    const response = await open(lease.id, 'download');

    expect(await (await fetch(response.headers.get('location')!)).text()).toBe(
      lease.body,
    );
  });

  it.each([
    ['the owner', () => owner],
    ['an analyst', () => analyst],
  ])('sends %s to the stored file', async (_, who) => {
    signedInAs(who());

    const response = await open(pnl.id);

    expect(response.status).toBe(307);
    expect(await (await fetch(response.headers.get('location')!)).text()).toBe(
      pnl.body,
    );
  });

  it('signs a new address on every load', async () => {
    signedInAs(owner);

    const first = (await open(pnl.id)).headers.get('location');
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    const second = (await open(pnl.id)).headers.get('location');

    expect(second).not.toBe(first);
  });

  it('downloads the file under its own name', async () => {
    signedInAs(owner);

    const response = await open(pnl.id, 'download');
    const stored = await fetch(response.headers.get('location')!);

    expect(stored.headers.get('content-disposition')).toContain(
      `filename*=UTF-8''${encodeURIComponent('P&L.xlsx')}`,
    );
  });

  it('is not found for a lender, even for a file their room shows', async () => {
    const { data: shown } = await lender.user
      .from('dr_document')
      .select('id')
      .eq('id', pnl.id)
      .throwOnError();
    expect(shown).toEqual([{ id: pnl.id }]);
    signedInAs(lender);

    await expect(open(pnl.id)).rejects.toMatchObject({
      digest: 'NEXT_HTTP_ERROR_FALLBACK;404',
    });
  });

  it('is not found for a seller, even for a file their room shows', async () => {
    const { data: shown } = await seller.user
      .from('dr_document')
      .select('id')
      .eq('id', sellerUpload.id)
      .throwOnError();
    expect(shown).toEqual([{ id: sellerUpload.id }]);
    signedInAs(seller);

    await expect(open(sellerUpload.id)).rejects.toMatchObject({
      digest: 'NEXT_HTTP_ERROR_FALLBACK;404',
    });
  });

  it("answers not found for a seller's counsel file", async () => {
    signedInAs(owner);

    expect((await open(counselMemo.id)).status).toBe(404);
  });

  it('writes no lender room activity when the team opens a lender package file', async () => {
    signedInAs(owner);

    await open(pnl.id);
    await open(statement.id, 'download');

    const { data } = await admin
      .from('lender_room_activity')
      .select('id')
      .eq('room_id', roomId)
      .throwOnError();
    expect(data).toEqual([]);
  });
});
