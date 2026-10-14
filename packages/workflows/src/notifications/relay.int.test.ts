import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  appendDealEvent,
  provisionAccount,
  seedDeal,
  type IntegrationAccount,
} from '../../test-support/integration-harness';

const novu = vi.hoisted(() => ({
  trigger: vi.fn(async () => undefined),
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
