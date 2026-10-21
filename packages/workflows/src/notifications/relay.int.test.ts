import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  appendDealEvent,
  provisionAccount,
  seedDeal,
  type IntegrationAccount,
} from '../../test-support/integration-harness';

const novu = vi.hoisted(() => ({
  trigger: vi.fn(async (_workflowId: string, _data: unknown) => undefined),
  subscribers: { identify: vi.fn() },
}));

vi.mock('@odb/notifications/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@odb/notifications/server')>()),
  createNovuClient: () => novu,
}));

import { notifyDealEvent } from './relay';

let owner: IntegrationAccount;
let shownTo: IntegrationAccount;
let hiddenFrom: IntegrationAccount;

async function seedFolder(dealId: string, name: string): Promise<string> {
  const { data } = await owner.admin
    .from('dr_folder')
    .insert({ account_id: owner.accountId, deal_id: dealId, name })
    .select('id')
    .single()
    .throwOnError();
  return data.id as string;
}

async function seedRoom(
  dealId: string,
  name: string,
  member: IntegrationAccount,
): Promise<string> {
  const { data: room } = await owner.admin
    .from('lender_room')
    .insert({
      account_id: owner.accountId,
      deal_id: dealId,
      name,
      private_folder_id: await seedFolder(dealId, name),
    })
    .select('id')
    .single()
    .throwOnError();

  await owner.admin
    .from('lender_room_member')
    .insert({
      room_id: room.id,
      user_id: member.userId,
      email: `${member.userId}@odb.test`,
    })
    .throwOnError();

  return room.id as string;
}

beforeAll(async () => {
  owner = await provisionAccount();
  shownTo = await provisionAccount();
  hiddenFrom = await provisionAccount();
  process.env.NOVU_API_KEY = 'secret';
  process.env.NOVU_API_URL = 'https://novu.test';
});

afterAll(async () => {
  delete process.env.NOVU_API_KEY;
  delete process.env.NOVU_API_URL;
  for (const table of ['lender_room', 'lender_package', 'dr_folder']) {
    await owner.admin
      .from(table)
      .delete()
      .eq('account_id', owner.accountId)
      .throwOnError();
  }
  await shownTo.cleanup();
  await hiddenFrom.cleanup();
  await owner.cleanup();
});

describe('notifyDealEvent for a document added to a data room (integration)', () => {
  it('tells the member of a room that shows the document and not the member of a room that hides it', async () => {
    const dealId = await seedDeal(owner.admin, owner.accountId, owner.userId, {
      description: 'Lender documents deal',
    });
    const masterFolderId = await seedFolder(dealId, 'Lender package');
    await owner.admin
      .from('lender_package')
      .insert({
        deal_id: dealId,
        account_id: owner.accountId,
        master_folder_id: masterFolderId,
      })
      .throwOnError();
    const shownRoomId = await seedRoom(dealId, 'First Bank', shownTo);
    const hidingRoomId = await seedRoom(dealId, 'Second Credit', hiddenFrom);

    const documentId = crypto.randomUUID();
    await appendDealEvent(owner.admin, {
      dealId,
      aggregateType: 'dr_document',
      aggregateId: documentId,
      eventType: 'dr_document.added',
      payload: {
        folder_id: masterFolderId,
        name: 'Tax returns.pdf',
        storage_path: `deal/${dealId}/${documentId}`,
        version: 1,
      },
    });
    await owner.admin
      .from('lender_room_hidden')
      .insert({ room_id: hidingRoomId, dr_document_id: documentId })
      .throwOnError();
    const { data: event } = await owner.admin
      .from('deal_event')
      .select('global_seq')
      .eq('aggregate_id', documentId)
      .single()
      .throwOnError();

    const { data: shownToUser } = await owner.admin.auth.admin.getUserById(
      shownTo.userId,
    );

    await notifyDealEvent({
      globalSeq: event.global_seq as number,
      workflowId: 'lender-room-documents',
      dealId,
      accountId: owner.accountId,
      actorRef: null,
      eventType: 'dr_document.added',
    });

    expect(novu.trigger.mock.calls).toEqual([
      [
        'lender-room-documents',
        {
          to: {
            subscriberId: shownTo.userId,
            email: shownToUser.user?.email,
          },
          payload: {
            roomId: shownRoomId,
            dealId,
            documentId,
            isNewVersion: false,
          },
          transactionId: `lender-room-documents:${event.global_seq}:${shownTo.userId}`,
        },
      ],
    ]);
  });

  it('sends nothing and does not throw for an event sequence that does not exist', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    novu.trigger.mockClear();

    await expect(
      notifyDealEvent({
        globalSeq: -1,
        workflowId: 'lender-room-documents',
        dealId: crypto.randomUUID(),
        accountId: owner.accountId,
        actorRef: null,
        eventType: 'dr_document.added',
      }),
    ).resolves.toBeUndefined();

    expect(novu.trigger).not.toHaveBeenCalled();
  });
});

describe("notifyDealEvent for a file added to the Seller's counsel folder (integration)", () => {
  const FOLDER_NOTICE = 'seller-counsel-folder.file-added';
  let team: IntegrationAccount;
  let seller: IntegrationAccount;
  let sellerCounsel: IntegrationAccount;
  let dealId: string;
  let roomId: string;
  let counselFolderId: string;

  async function emailOf(person: IntegrationAccount): Promise<string> {
    const { data } = await team.admin.auth.admin.getUserById(person.userId);
    return data.user!.email!;
  }

  async function relayFileAdded(
    name: string,
    uploadedBy: string,
    storagePath?: string,
  ) {
    const documentId = crypto.randomUUID();
    await appendDealEvent(team.admin, {
      dealId,
      aggregateType: 'dr_document',
      aggregateId: documentId,
      eventType: 'dr_document.added',
      payload: {
        folder_id: counselFolderId,
        name,
        storage_path: storagePath ?? `deal/${dealId}/${documentId}`,
        version: 1,
        uploaded_by: uploadedBy,
      },
    });
    const { data: event } = await team.admin
      .from('deal_event')
      .select('global_seq')
      .eq('aggregate_id', documentId)
      .single()
      .throwOnError();

    novu.trigger.mockClear();
    await notifyDealEvent({
      globalSeq: event.global_seq as number,
      workflowId: 'lender-room-documents',
      dealId,
      accountId: team.accountId,
      actorRef: null,
      eventType: 'dr_document.added',
    });

    return event.global_seq as number;
  }

  function folderNotices() {
    return novu.trigger.mock.calls.filter(
      ([workflowId]) => workflowId === FOLDER_NOTICE,
    );
  }

  beforeAll(async () => {
    team = await provisionAccount();
    seller = await provisionAccount();
    sellerCounsel = await provisionAccount();
    const { data: firm } = await team.admin
      .from('firm')
      .insert({ account_id: team.accountId, name: 'Brennan Tooling' })
      .select('id')
      .single()
      .throwOnError();
    dealId = await seedDeal(team.admin, team.accountId, team.userId, {
      firm_id: firm.id,
      description: 'Private team description',
    });
    const { data: uploads } = await team.admin
      .from('dr_folder')
      .insert({
        account_id: team.accountId,
        deal_id: dealId,
        name: 'Seller uploads',
      })
      .select('id')
      .single()
      .throwOnError();
    const { data: room } = await team.admin
      .from('seller_room')
      .insert({
        account_id: team.accountId,
        deal_id: dealId,
        uploads_folder_id: uploads.id,
      })
      .select('id')
      .single()
      .throwOnError();
    roomId = room.id as string;
    await team.admin
      .from('seller_room_member')
      .insert({
        room_id: roomId,
        user_id: seller.userId,
        email: await emailOf(seller),
        name: 'Walt Brennan',
      })
      .throwOnError();
    await team.admin
      .from('deal_counsel')
      .insert({
        account_id: team.accountId,
        deal_id: dealId,
        side: 'seller',
        user_id: sellerCounsel.userId,
        email: await emailOf(sellerCounsel),
        name: 'Owen Castillo',
      })
      .throwOnError();
    const { data: folder } = await team.admin
      .from('seller_counsel_folder')
      .select('folder_id')
      .eq('deal_id', dealId)
      .single()
      .throwOnError();
    counselFolderId = folder.folder_id as string;
  });

  afterAll(async () => {
    await team.admin
      .from('accounts')
      .delete()
      .eq('id', team.accountId)
      .throwOnError();
    await seller.cleanup();
    await sellerCounsel.cleanup();
    await team.cleanup();
  });

  it("tells the seller, never the team, when seller's counsel add a file", async () => {
    const seq = await relayFileAdded('indemnity.pdf', sellerCounsel.userId);

    expect(folderNotices()).toEqual([
      [
        FOLDER_NOTICE,
        {
          to: { subscriberId: seller.userId, email: await emailOf(seller) },
          payload: {
            audience: 'seller',
            dealId,
            roomId,
            uploaderName: 'Owen Castillo',
            fileName: 'indemnity.pdf',
            fileCount: 1,
            businessName: 'Brennan Tooling',
          },
          transactionId: `${FOLDER_NOTICE}:${seq}:${seller.userId}`,
        },
      ],
    ]);
  });

  it("tells seller's counsel, never the team, when the seller adds a file", async () => {
    const seq = await relayFileAdded('customer-list.pdf', seller.userId);

    expect(folderNotices()).toEqual([
      [
        FOLDER_NOTICE,
        {
          to: {
            subscriberId: sellerCounsel.userId,
            email: await emailOf(sellerCounsel),
          },
          payload: {
            audience: 'counsel',
            dealId,
            roomId,
            uploaderName: 'Walt Brennan',
            fileName: 'customer-list.pdf',
            fileCount: 1,
            businessName: 'Brennan Tooling',
          },
          transactionId: `${FOLDER_NOTICE}:${seq}:${sellerCounsel.userId}`,
        },
      ],
    ]);
  });

  it('tells of a ZIP once, naming how many files it held and the ZIP', async () => {
    const { data: batch } = await team.admin
      .from('upload_batch')
      .insert({
        account_id: team.accountId,
        deal_id: dealId,
        kind: 'zip',
        status: 'extracting',
        file_count: 3,
        source_filename: 'disclosures.zip',
        created_by: sellerCounsel.userId,
      })
      .select('id')
      .single()
      .throwOnError();
    const files = ['a.pdf', 'b.pdf', 'c.pdf'].map((name) => ({
      name,
      storagePath: `deal/${dealId}/zip/${batch.id}/${name}`,
    }));
    await team.admin
      .from('upload_item')
      .insert(
        files.map((file) => ({
          batch_id: batch.id,
          storage_path: file.storagePath,
          original_path: file.name,
        })),
      )
      .throwOnError();

    const notices = [];
    const seqs = [];
    for (const file of files) {
      seqs.push(
        await relayFileAdded(file.name, sellerCounsel.userId, file.storagePath),
      );
      notices.push(...folderNotices());
    }

    expect(notices).toEqual([
      [
        FOLDER_NOTICE,
        {
          to: { subscriberId: seller.userId, email: await emailOf(seller) },
          payload: {
            audience: 'seller',
            dealId,
            roomId,
            uploaderName: 'Owen Castillo',
            fileName: '3 files (disclosures.zip)',
            fileCount: 3,
            businessName: 'Brennan Tooling',
          },
          transactionId: `${FOLDER_NOTICE}:${seqs[0]}:${seller.userId}`,
        },
      ],
    ]);
  });

  it('skips with a log when the uploader has left the seller side', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});

    await relayFileAdded('orphan.pdf', team.userId);

    expect(folderNotices()).toEqual([]);
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining('uploader is no longer on the seller side'),
    );
    info.mockRestore();
  });

  it('sends nothing when Novu is not set up', async () => {
    delete process.env.NOVU_API_KEY;

    await relayFileAdded('memo.pdf', sellerCounsel.userId);

    process.env.NOVU_API_KEY = 'secret';
    expect(folderNotices()).toEqual([]);
  });
});

describe('notifyDealEvent for a seller and counsel thread message (integration)', () => {
  const MESSAGE_NOTICE = 'seller-counsel-message.posted';
  let team: IntegrationAccount;
  let seller: IntegrationAccount;
  let sellerCounsel: IntegrationAccount;
  let dealId: string;
  let roomId: string;

  async function emailOf(person: IntegrationAccount): Promise<string> {
    const { data } = await team.admin.auth.admin.getUserById(person.userId);
    return data.user!.email!;
  }

  async function relayPost(
    author: IntegrationAccount,
    side: 'seller' | 'counsel',
    name: string,
  ) {
    const { data: message } = await team.admin
      .from('seller_counsel_message')
      .insert({
        account_id: team.accountId,
        deal_id: dealId,
        author_user_id: author.userId,
        author_side: side,
        author_name: name,
        body: 'Private note',
      })
      .select('id')
      .single()
      .throwOnError();
    await appendDealEvent(team.admin, {
      dealId,
      aggregateType: 'seller_counsel_message',
      aggregateId: message.id,
      eventType: 'seller_counsel_message.posted',
    });
    const { data: event } = await team.admin
      .from('deal_event')
      .select('global_seq')
      .eq('aggregate_id', message.id)
      .single()
      .throwOnError();

    novu.trigger.mockClear();
    await notifyDealEvent({
      globalSeq: event.global_seq as number,
      workflowId: MESSAGE_NOTICE,
      dealId,
      accountId: team.accountId,
      actorRef: null,
      eventType: 'seller_counsel_message.posted',
    });

    return { seq: event.global_seq as number, messageId: message.id as string };
  }

  async function teamNotifications() {
    const { data } = await team.admin
      .from('notifications')
      .select('id')
      .eq('deal_id', dealId)
      .throwOnError();
    return data;
  }

  beforeAll(async () => {
    team = await provisionAccount();
    seller = await provisionAccount();
    sellerCounsel = await provisionAccount();
    const { data: firm } = await team.admin
      .from('firm')
      .insert({ account_id: team.accountId, name: 'Brennan Tooling' })
      .select('id')
      .single()
      .throwOnError();
    dealId = await seedDeal(team.admin, team.accountId, team.userId, {
      firm_id: firm.id,
      description: 'Private team description',
    });
    await appendDealEvent(team.admin, {
      dealId,
      aggregateType: 'deal',
      aggregateId: dealId,
      eventType: 'deal.updated',
      payload: { code_name: `Project ${dealId.slice(0, 8)}` },
    });
    const { data: uploads } = await team.admin
      .from('dr_folder')
      .insert({
        account_id: team.accountId,
        deal_id: dealId,
        name: 'Seller uploads',
      })
      .select('id')
      .single()
      .throwOnError();
    const { data: room } = await team.admin
      .from('seller_room')
      .insert({
        account_id: team.accountId,
        deal_id: dealId,
        uploads_folder_id: uploads.id,
      })
      .select('id')
      .single()
      .throwOnError();
    roomId = room.id as string;
    await team.admin
      .from('seller_room_member')
      .insert({
        room_id: roomId,
        user_id: seller.userId,
        email: await emailOf(seller),
        name: 'Walt Brennan',
      })
      .throwOnError();
    await team.admin
      .from('deal_counsel')
      .insert({
        account_id: team.accountId,
        deal_id: dealId,
        side: 'seller',
        user_id: sellerCounsel.userId,
        email: await emailOf(sellerCounsel),
        name: 'Owen Castillo',
      })
      .throwOnError();
  });

  afterAll(async () => {
    await team.admin
      .from('accounts')
      .delete()
      .eq('id', team.accountId)
      .throwOnError();
    await seller.cleanup();
    await sellerCounsel.cleanup();
    await team.cleanup();
  });

  it("emails seller's counsel, never the team, when the seller writes", async () => {
    const { seq, messageId } = await relayPost(
      seller,
      'seller',
      'Walt Brennan',
    );

    expect(novu.trigger.mock.calls).toEqual([
      [
        MESSAGE_NOTICE,
        {
          to: {
            subscriberId: sellerCounsel.userId,
            email: await emailOf(sellerCounsel),
          },
          payload: {
            audience: 'counsel',
            dealId,
            roomId,
            authorName: 'Walt Brennan',
            messageId,
            businessName: 'Brennan Tooling',
            outsideName: `Project ${dealId.slice(0, 8)}`,
          },
          transactionId: `${MESSAGE_NOTICE}:${seq}:${sellerCounsel.userId}`,
        },
      ],
    ]);
    expect(await teamNotifications()).toEqual([]);
  });

  it("emails the seller when seller's counsel write", async () => {
    const { seq, messageId } = await relayPost(
      sellerCounsel,
      'counsel',
      'Owen Castillo',
    );

    expect(novu.trigger.mock.calls).toEqual([
      [
        MESSAGE_NOTICE,
        {
          to: { subscriberId: seller.userId, email: await emailOf(seller) },
          payload: {
            audience: 'seller',
            dealId,
            roomId,
            authorName: 'Owen Castillo',
            messageId,
            businessName: 'Brennan Tooling',
            outsideName: `Project ${dealId.slice(0, 8)}`,
          },
          transactionId: `${MESSAGE_NOTICE}:${seq}:${seller.userId}`,
        },
      ],
    ]);
  });

  it('names the business in the subject when the deal has no code name', async () => {
    await appendDealEvent(team.admin, {
      dealId,
      aggregateType: 'deal',
      aggregateId: dealId,
      eventType: 'deal.updated',
      payload: { code_name: null },
    });

    await relayPost(seller, 'seller', 'Walt Brennan');

    expect(novu.trigger.mock.calls[0]![1]).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({ outsideName: 'Brennan Tooling' }),
      }),
    );
  });

  it('skips with a log when the message is gone before the relay runs', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { data: message } = await team.admin
      .from('seller_counsel_message')
      .insert({
        account_id: team.accountId,
        deal_id: dealId,
        author_user_id: seller.userId,
        author_side: 'seller',
        author_name: 'Walt Brennan',
        body: 'Soon gone',
      })
      .select('id')
      .single()
      .throwOnError();
    await appendDealEvent(team.admin, {
      dealId,
      aggregateType: 'seller_counsel_message',
      aggregateId: message.id,
      eventType: 'seller_counsel_message.posted',
    });
    const { data: event } = await team.admin
      .from('deal_event')
      .select('global_seq')
      .eq('aggregate_id', message.id)
      .single()
      .throwOnError();
    await team.admin
      .from('seller_counsel_message')
      .delete()
      .eq('id', message.id)
      .throwOnError();
    novu.trigger.mockClear();

    await notifyDealEvent({
      globalSeq: event.global_seq as number,
      workflowId: MESSAGE_NOTICE,
      dealId,
      accountId: team.accountId,
      actorRef: null,
      eventType: 'seller_counsel_message.posted',
    });

    expect(novu.trigger.mock.calls).toEqual([]);
    expect(info).toHaveBeenCalledWith(expect.stringContaining('was not found'));
    info.mockRestore();
  });

  it('sends nothing and tells the team nothing when Novu is not set up', async () => {
    delete process.env.NOVU_API_KEY;

    await relayPost(seller, 'seller', 'Walt Brennan');

    process.env.NOVU_API_KEY = 'secret';
    expect(novu.trigger.mock.calls).toEqual([]);
    expect(await teamNotifications()).toEqual([]);
  });
});
