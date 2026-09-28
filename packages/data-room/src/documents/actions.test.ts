import { beforeEach, describe, expect, it, vi } from 'vitest';

import { appendDealEvent, appendDealEvents } from '@odb/events';

vi.mock('@odb/next/actions', () => ({
  enhanceAction: (fn: unknown) => fn,
}));

vi.mock('@odb/events', () => ({
  appendDealEvent: vi.fn(),
  appendDealEvents: vi.fn(),
}));

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
  appendDealEventMock.mockReset().mockResolvedValue([
    { deal_seq: 1, aggregate_seq: 1 },
  ]);
  appendDealEventsMock.mockReset().mockResolvedValue([
    { deal_seq: 1, aggregate_seq: 1 },
  ]);
});

describe('uploadDocument', () => {
  it('emits dr_document.added and checklist_item.status_changed atomically when a checklist item is linked', async () => {
    const { uploadDocument } = await import('./actions');

    await uploadDocument({
      dealId: 'deal',
      folderId: 'folder',
      name: 'balance.pdf',
      body: new Uint8Array([1]),
      checklistItemId: 'checklist-1',
    });

    expect(appendDealEventsMock).toHaveBeenCalledTimes(1);
    expect(appendDealEventMock).not.toHaveBeenCalled();

    const [eventsClient, dealId, events] = appendDealEventsMock.mock.calls[0]!;
    expect(eventsClient).toBe(client);
    expect(dealId).toBe('deal');
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      aggregateType: 'dr_document',
      eventType: 'dr_document.added',
      payload: {
        folder_id: 'folder',
        name: 'balance.pdf',
        version: 1,
        checklist_item_id: 'checklist-1',
      },
    });
    expect(typeof events[0]!.aggregateId).toBe('string');
    expect(events[1]).toMatchObject({
      aggregateType: 'checklist_item',
      aggregateId: 'checklist-1',
      eventType: 'checklist_item.status_changed',
      payload: { status: 'received' },
    });
    expect(
      (events[1]!.payload as { received_at: string }).received_at,
    ).toEqual(expect.any(String));
  });

  it('emits only dr_document.added when no checklist item is linked', async () => {
    const { uploadDocument } = await import('./actions');

    await uploadDocument({
      dealId: 'deal',
      folderId: 'folder',
      name: 'notes.pdf',
      body: new Uint8Array([1]),
      checklistItemId: null,
    });

    expect(appendDealEventMock).toHaveBeenCalledTimes(1);
    expect(appendDealEventsMock).not.toHaveBeenCalled();

    const [, input] = appendDealEventMock.mock.calls[0]!;
    expect(input).toMatchObject({
      dealId: 'deal',
      aggregateType: 'dr_document',
      eventType: 'dr_document.added',
      payload: {
        folder_id: 'folder',
        name: 'notes.pdf',
        version: 1,
        checklist_item_id: null,
      },
    });
  });
});

describe('moveDocument', () => {
  it('emits a dr_document.moved event for the document', async () => {
    const { moveDocument } = await import('./actions');

    await moveDocument({
      dealId: 'deal',
      documentId: 'doc-1',
      folderId: 'target',
    });

    expect(appendDealEventMock).toHaveBeenCalledTimes(1);
    const [, input] = appendDealEventMock.mock.calls[0]!;
    expect(input).toMatchObject({
      dealId: 'deal',
      aggregateType: 'dr_document',
      aggregateId: 'doc-1',
      eventType: 'dr_document.moved',
      payload: { folder_id: 'target' },
    });
  });
});
