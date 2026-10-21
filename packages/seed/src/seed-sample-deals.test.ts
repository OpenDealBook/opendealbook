import { beforeEach, describe, expect, it, vi } from 'vitest';

const world = vi.hoisted(() => ({
  seeded: null as unknown,
  uploadError: null as unknown,
  seedCalls: [] as unknown[],
  uploads: [] as string[],
  removed: [] as string[][],
  removeError: null as unknown,
  events: [] as unknown[],
}));

vi.mock('@odb/supabase/admin', () => ({
  getSupabaseServerAdminClient: () => ({
    rpc: (name: string, args: unknown) => ({
      throwOnError: async () => {
        world.seedCalls.push({ name, args });
        return { data: world.seeded };
      },
    }),
    storage: {
      from: () => ({
        upload: async (path: string) => {
          world.uploads.push(path);
          return { data: null, error: world.uploadError };
        },
        remove: async (paths: string[]) => {
          world.removed.push(paths);
          return { data: [], error: world.removeError };
        },
      }),
    },
  }),
}));

vi.mock('@odb/events', () => ({
  appendDealEvent: async (_client: unknown, event: unknown) => {
    world.events.push(event);
    return [{ deal_seq: 1, aggregate_seq: 1 }];
  },
}));

import {
  SAMPLE_DEALS_NOT_LOADED,
  SampleDealsNotLoaded,
  seedSampleDeals,
  seedSampleDealsOnce,
} from './seed-sample-deals';

const seededDocument = {
  deal_id: '6221ddef-b8e9-484f-8bb8-0967d8e16a30',
  document_id: '5f675954-8b8a-402f-856d-555c3b0635f5',
  storage_path: 'deal/6221ddef-b8e9-484f-8bb8-0967d8e16a30/x-trailing-12-month-pl.pdf',
  removed_paths: [] as string[],
};
const oldFile = 'deal/9b1f7c0e-2a4d-4c3b-8e5f-6a7b8c9d0e1f/y-trailing-12-month-pl.pdf';
const team = { accountId: 'team-1', userId: 'user-1' };

beforeEach(() => {
  world.seeded = seededDocument;
  world.uploadError = null;
  world.seedCalls.length = 0;
  world.uploads.length = 0;
  world.removed.length = 0;
  world.removeError = null;
  world.events.length = 0;
});

describe('seedSampleDealsOnce', () => {
  it('seeds the team once and stores the sample document after the seed commits', async () => {
    await seedSampleDealsOnce(team);

    expect(world.seedCalls).toEqual([
      {
        name: 'seed_sample_deals',
        args: { p_account_id: 'team-1', p_user_id: 'user-1', p_only_once: true },
      },
    ]);
    expect(world.uploads).toEqual([seededDocument.storage_path]);
  });

  it('stores nothing when the team was already seeded', async () => {
    world.seeded = null;

    await seedSampleDealsOnce(team);

    expect(world.uploads).toEqual([]);
  });

  it('removes the sample document and reports the failure when its file cannot be stored', async () => {
    world.uploadError = new Error('storage down');

    await expect(seedSampleDealsOnce(team)).rejects.toThrow(
      new SampleDealsNotLoaded(),
    );
    expect(new SampleDealsNotLoaded().message).toBe(SAMPLE_DEALS_NOT_LOADED);
    expect(world.events).toEqual([
      {
        dealId: seededDocument.deal_id,
        aggregateType: 'dr_document',
        aggregateId: seededDocument.document_id,
        eventType: 'dr_document.removed',
        actorKind: 'service',
        payload: {},
      },
    ]);
  });
});

describe('seedSampleDeals', () => {
  it('reloads the examples whether or not the team was seeded before', async () => {
    await seedSampleDeals(team);

    expect(world.seedCalls).toEqual([
      {
        name: 'seed_sample_deals',
        args: { p_account_id: 'team-1', p_user_id: 'user-1', p_only_once: false },
      },
    ]);
  });

  it('removes the replaced examples files from storage after the reload commits', async () => {
    world.seeded = { ...seededDocument, removed_paths: [oldFile] };

    await seedSampleDeals(team);

    expect(world.uploads).toEqual([seededDocument.storage_path]);
    expect(world.removed).toEqual([[oldFile]]);
  });

  it('fails the reload when the replaced files cannot be removed', async () => {
    world.seeded = { ...seededDocument, removed_paths: [oldFile] };
    world.removeError = new Error('storage down');

    await expect(seedSampleDeals(team)).rejects.toThrow(
      new SampleDealsNotLoaded(),
    );
  });
});
