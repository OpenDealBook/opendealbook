import { beforeEach, describe, expect, it, vi } from 'vitest';

import { appendDealEvent, appendDealEvents } from '@odb/events';

vi.mock('@odb/next/actions', () => ({
  enhanceAction: (fn: unknown) => fn,
}));

vi.mock('@odb/events', () => ({
  appendDealEvent: vi.fn(),
  appendDealEvents: vi.fn(),
}));

const DEAL = '6221ddef-b8e9-484f-8bb8-0967d8e16a30';
const FOLDER = '5f675954-8b8a-402f-856d-555c3b0635f5';
const TARGET_FOLDER = 'd189aa4d-3d82-46d6-8967-4a2079217dfb';
const CHECKLIST_ITEM = '2b9e4c1a-7d3f-4e8a-9b6c-1f2e3d4c5b6a';
const DOCUMENT = '3c0f5d2b-8e4a-4f9b-8c7d-2a3b4c5d6e7f';

const client = makeClient();

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => client,
}));

function makeClient() {
  const builder: Record<string, unknown> = {};
  Object.assign(builder, {
    select: () => builder,
    eq: () => builder,
    insert: () => builder,
    update: () => builder,
    single: async () => ({ data: { id: 'row', version: 1 }, error: null }),
    then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve),
  });

  return {
    async rpc() {
      return { data: true, error: null };
    },
    storage: {
      from: () => ({
        async upload(path: string) {
          return { data: { path }, error: null };
        },
      }),
    },
    from: () => builder,
  };
}

const appendDealEventMock = vi.mocked(appendDealEvent);
const appendDealEventsMock = vi.mocked(appendDealEvents);

beforeEach(() => {
  appendDealEventMock
    .mockReset()
    .mockResolvedValue([{ deal_seq: 1, aggregate_seq: 1 }]);
  appendDealEventsMock
    .mockReset()
    .mockResolvedValue([{ deal_seq: 1, aggregate_seq: 1 }]);
});

describe('uploadDocument', () => {
  it('emits dr_document.added, links it to the checklist item and marks the item received, atomically', async () => {
    const { uploadDocument } = await import('./actions');

    await uploadDocument({
      dealId: DEAL,
      folderId: FOLDER,
      name: 'balance.pdf',
      body: new Uint8Array([1]),
      checklistItemId: CHECKLIST_ITEM,
    });

    expect(appendDealEventsMock).toHaveBeenCalledTimes(1);
    expect(appendDealEventMock).not.toHaveBeenCalled();

    const [eventsClient, dealId, events] = appendDealEventsMock.mock.calls[0]!;
    expect(eventsClient).toBe(client);
    expect(dealId).toBe(DEAL);
    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({
      aggregateType: 'dr_document',
      eventType: 'dr_document.added',
      payload: {
        folder_id: FOLDER,
        name: 'balance.pdf',
        version: 1,
      },
    });
    expect(typeof events[0]!.aggregateId).toBe('string');
    expect(events[1]).toMatchObject({
      aggregateType: 'checklist_item',
      aggregateId: CHECKLIST_ITEM,
      eventType: 'checklist_item.document_linked',
      payload: { document_id: events[0]!.aggregateId },
    });
    expect(events[2]).toMatchObject({
      aggregateType: 'checklist_item',
      aggregateId: CHECKLIST_ITEM,
      eventType: 'checklist_item.status_changed',
      payload: { status: 'received' },
    });
    expect((events[2]!.payload as { received_at: string }).received_at).toEqual(
      expect.any(String),
    );
  });

  it('emits only dr_document.added when no checklist item is linked', async () => {
    const { uploadDocument } = await import('./actions');

    await uploadDocument({
      dealId: DEAL,
      folderId: FOLDER,
      name: 'notes.pdf',
      body: new Uint8Array([1]),
      checklistItemId: null,
    });

    expect(appendDealEventMock).toHaveBeenCalledTimes(1);
    expect(appendDealEventsMock).not.toHaveBeenCalled();

    const [, input] = appendDealEventMock.mock.calls[0]!;
    expect(input).toMatchObject({
      dealId: DEAL,
      aggregateType: 'dr_document',
      eventType: 'dr_document.added',
      payload: {
        folder_id: FOLDER,
        name: 'notes.pdf',
        version: 1,
      },
    });
  });
});

describe('moveDocument', () => {
  it('emits a dr_document.moved event for the document', async () => {
    const { moveDocument } = await import('./actions');

    await moveDocument({
      dealId: DEAL,
      documentId: DOCUMENT,
      folderId: TARGET_FOLDER,
    });

    expect(appendDealEventMock).toHaveBeenCalledTimes(1);
    const [, input] = appendDealEventMock.mock.calls[0]!;
    expect(input).toMatchObject({
      dealId: DEAL,
      aggregateType: 'dr_document',
      aggregateId: DOCUMENT,
      eventType: 'dr_document.moved',
      payload: { folder_id: TARGET_FOLDER },
    });
  });
});
