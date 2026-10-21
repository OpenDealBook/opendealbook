import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMemoryClient, type MemoryClient } from './memory-client';

const DEAL = '6221ddef-b8e9-484f-8bb8-0967d8e16a30';
const BATCH = 'd189aa4d-3d82-46d6-8967-4a2079217dfb';
const FOLDER = '5f675954-8b8a-402f-856d-555c3b0635f5';
const ANALYST_PERMISSIONS = ['deals.work'];

const holder = vi.hoisted(() => ({ memory: null as unknown as MemoryClient }));

vi.mock('@odb/next/actions', () => ({
  enhanceAction:
    (fn: (data: unknown, user: { id: string }) => unknown) => (data: unknown) =>
      fn(data, { id: 'analyst' }),
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () =>
    Object.assign(holder.memory.client, {
      rpc: async (_name: string, args: { permission: string }) => ({
        data: ANALYST_PERMISSIONS.includes(args.permission),
        error: null,
      }),
    }),
}));

vi.mock('@odb/events', () => ({
  appendDealEvent: vi.fn(async () => [{ deal_seq: 1, aggregate_seq: 1 }]),
  appendDealEvents: vi.fn(),
}));

import { expandUploadBatch, stageUpload } from './actions';

beforeEach(() => {
  holder.memory = createMemoryClient({
    seed: { deal: [{ id: DEAL, account_id: 'acct' }] },
  });
});

describe('uploads for an analyst who works deals but does not manage them', () => {
  it('stages the files', async () => {
    await stageUpload({
      dealId: DEAL,
      kind: 'single',
      files: [{ originalPath: 'lease.pdf', body: new Uint8Array([1]) }],
    });

    expect(holder.memory.uploads).toHaveLength(1);
    expect(holder.memory.tables.upload_batch).toHaveLength(1);
  });

  it('imports a staged batch into the folder', async () => {
    holder.memory.tables.upload_batch = [{ id: BATCH, status: 'ready' }];
    holder.memory.tables.upload_item = [
      {
        id: 'item-1',
        batch_id: BATCH,
        storage_path: `${DEAL}/item-1.pdf`,
        original_path: 'lease.pdf',
        status: 'pending',
      },
    ];

    await expandUploadBatch({
      dealId: DEAL,
      batchId: BATCH,
      targetFolderId: FOLDER,
    });

    expect(holder.memory.tables.upload_item?.[0]?.status).toBe('imported');
  });
});
