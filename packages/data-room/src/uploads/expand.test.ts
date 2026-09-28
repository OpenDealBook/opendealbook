import { beforeEach, describe, expect, it, vi } from 'vitest';

import { appendDealEvent } from '@odb/events';

import { expandBatch } from './expand';
import { createMemoryClient } from './memory-client';

vi.mock('@odb/events', () => ({
  appendDealEvent: vi.fn(),
  appendDealEvents: vi.fn(),
}));

const appendDealEventMock = vi.mocked(appendDealEvent);

const pendingItem = (id: string, originalPath: string) => ({
  id,
  batch_id: 'batch',
  storage_path: `deal/deal/${id}.pdf`,
  original_path: originalPath,
  size_bytes: 10,
  content_type: null,
  status: 'pending',
  target_folder_id: null,
  dr_document_id: null,
  error: null,
});

beforeEach(() => {
  appendDealEventMock.mockReset();
  appendDealEventMock.mockResolvedValue([{ deal_seq: 1, aggregate_seq: 1 }]);
});

describe('expandBatch', () => {
  it('imports pending items into dr_document via a dr_document.added event', async () => {
    const memory = createMemoryClient({
      seed: {
        upload_batch: [{ id: 'batch', status: 'ready' }],
        upload_item: [pendingItem('item-1', 'a.pdf')],
      },
    });

    const result = await expandBatch(memory.client, {
      dealId: 'deal',
      batchId: 'batch',
      targetFolderId: 'folder',
    });

    expect(result.imported).toBe(1);
    expect(result.failed).toBe(0);

    expect(appendDealEventMock).toHaveBeenCalledTimes(1);
    const [client, input] = appendDealEventMock.mock.calls[0]!;
    expect(client).toBe(memory.client);
    expect(input).toMatchObject({
      dealId: 'deal',
      aggregateType: 'dr_document',
      eventType: 'dr_document.added',
      payload: {
        folder_id: 'folder',
        name: 'a.pdf',
        storage_path: 'deal/deal/item-1.pdf',
        version: 1,
        checklist_item_id: null,
      },
    });

    const item = memory.tables.upload_item?.[0];
    expect(item?.status).toBe('imported');
    expect(item?.dr_document_id).toBe(input.aggregateId);
    expect(item?.target_folder_id).toBe('folder');

    expect(memory.tables.upload_batch?.[0]?.status).toBe('imported');
  });

  it('captures a per-item event failure and still imports the healthy items', async () => {
    appendDealEventMock.mockImplementation(async (_client, input) => {
      if ((input.payload as { name: string }).name === 'bad.pdf') {
        throw new Error('event rejected');
      }
      return [{ deal_seq: 1, aggregate_seq: 1 }];
    });

    const memory = createMemoryClient({
      seed: {
        upload_batch: [{ id: 'batch', status: 'ready' }],
        upload_item: [
          pendingItem('item-ok', 'good.pdf'),
          pendingItem('item-bad', 'bad.pdf'),
        ],
      },
    });

    const result = await expandBatch(memory.client, {
      dealId: 'deal',
      batchId: 'batch',
      targetFolderId: 'folder',
    });

    expect(result.imported).toBe(1);
    expect(result.failed).toBe(1);

    const failed = memory.tables.upload_item?.find(
      (row) => row.id === 'item-bad',
    );
    expect(failed?.status).toBe('failed');
    expect(failed?.error).toBeTruthy();

    const ok = memory.tables.upload_item?.find((row) => row.id === 'item-ok');
    expect(ok?.status).toBe('imported');
  });
});
