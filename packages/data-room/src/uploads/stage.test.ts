import { describe, expect, it } from 'vitest';

import { createMemoryClient } from './memory-client';
import { stageBatch } from './stage';

const entry = (originalPath: string, byte: number) => ({
  originalPath,
  contentType: null,
  bytes: new Uint8Array([byte]),
});

describe('stageBatch', () => {
  it('creates a ready batch whose file_count matches the staged entries', async () => {
    const memory = createMemoryClient();

    const { batch } = await stageBatch(memory.client, {
      accountId: 'acct',
      dealId: 'deal',
      createdBy: 'user',
      kind: 'group',
      sourceFilename: null,
      entries: [entry('a.pdf', 1), entry('b.pdf', 2)],
    });

    expect(batch.status).toBe('ready');
    expect(batch.file_count).toBe(2);
    expect(memory.tables.upload_batch).toHaveLength(1);
  });

  it('stages each entry to storage and records one pending item per entry', async () => {
    const memory = createMemoryClient();

    const { items } = await stageBatch(memory.client, {
      accountId: 'acct',
      dealId: 'deal',
      createdBy: 'user',
      kind: 'zip',
      sourceFilename: 'archive.zip',
      entries: [entry('reports/q1.pdf', 1), entry('reports/q2.pdf', 2)],
    });

    expect(memory.uploads).toHaveLength(2);
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.original_path)).toEqual([
      'reports/q1.pdf',
      'reports/q2.pdf',
    ]);
    expect(items.every((item) => item.status === 'pending')).toBe(true);
    expect(items.every((item) => item.storage_path.startsWith('deal/'))).toBe(
      true,
    );
  });
});
