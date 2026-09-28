import { describe, expect, it } from 'vitest';

import { expandBatch } from './expand';
import { createMemoryClient } from './memory-client';

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

describe('expandBatch', () => {
  it('imports pending items into dr_document rows in the target folder', async () => {
    const memory = createMemoryClient({
      seed: {
        upload_batch: [{ id: 'batch', status: 'ready' }],
        upload_item: [pendingItem('item-1', 'a.pdf')],
      },
    });

    const result = await expandBatch(memory.client, {
      accountId: 'acct',
      dealId: 'deal',
      batchId: 'batch',
      targetFolderId: 'folder',
      uploadedBy: 'user',
    });

    expect(result.imported).toBe(1);
    expect(result.failed).toBe(0);

    const document = memory.tables.dr_document?.[0];
    expect(document?.folder_id).toBe('folder');
    expect(document?.name).toBe('a.pdf');

    const item = memory.tables.upload_item?.[0];
    expect(item?.status).toBe('imported');
    expect(item?.dr_document_id).toBe(document?.id);
    expect(item?.target_folder_id).toBe('folder');

    expect(memory.tables.upload_batch?.[0]?.status).toBe('imported');
  });

  it('captures a per-item error and still imports the healthy items', async () => {
    const memory = createMemoryClient({
      seed: {
        upload_batch: [{ id: 'batch', status: 'ready' }],
        upload_item: [
          pendingItem('item-ok', 'good.pdf'),
          pendingItem('item-bad', 'bad.pdf'),
        ],
      },
      failDocumentInsert: (row) => row.name === 'bad.pdf',
    });

    const result = await expandBatch(memory.client, {
      accountId: 'acct',
      dealId: 'deal',
      batchId: 'batch',
      targetFolderId: 'folder',
      uploadedBy: 'user',
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
