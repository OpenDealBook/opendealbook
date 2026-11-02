import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AddedDocument } from '../documentIngestion/ingestion';

const world = vi.hoisted(() => ({
  added: [] as AddedDocument[],
  latest: 0,
  cursors: new Map<string, number>(),
  started: [] as string[],
  failing: new Set<string>(),
  setAside: [] as { globalSeq: number; error: string }[],
  continuedWith: undefined as unknown,
}));

vi.mock('@temporalio/workflow', () => {
  class ActivityFailure extends Error {
    constructor(override readonly cause: Error) {
      super('Activity task failed');
    }
  }
  const activities: Record<string, (input: never) => Promise<unknown>> = {
    loadRelayCursor: async (name: string) => world.cursors.get(name) ?? null,
    startRelayCursorAtLatest: async (name: string) => {
      world.cursors.set(name, world.latest);
      return world.latest;
    },
    saveRelayCursor: async (input: { name: string; lastGlobalSeq: number }) => {
      world.cursors.set(input.name, input.lastGlobalSeq);
    },
    fetchAddedDocuments: async (input: { afterGlobalSeq: number }) =>
      world.added.filter((event) => event.globalSeq > input.afterGlobalSeq),
    startDocumentIngestion: async (input: { drDocumentId: string }) => {
      if (world.failing.has(input.drDocumentId)) {
        throw new ActivityFailure(new Error('dr_document not found'));
      }
      world.started.push(input.drDocumentId);
    },
    recordRelayFailedEvent: async (failure: {
      globalSeq: number;
      error: string;
    }) => {
      world.setAside.push({
        globalSeq: failure.globalSeq,
        error: failure.error,
      });
    },
  };
  return {
    ActivityFailure,
    proxyActivities: () => activities,
    sleep: async () => undefined,
    continueAsNew: async (input: unknown) => {
      world.continuedWith = input;
    },
  };
});

const { documentIngestionRelay } = await import('./documentIngestionRelay');

beforeEach(() => {
  world.added = [
    { globalSeq: 11, drDocumentId: 'lease' },
    { globalSeq: 14, drDocumentId: 'tax-return' },
  ];
  world.latest = 9;
  world.cursors.clear();
  world.started = [];
  world.failing.clear();
  world.setAside = [];
});

describe('documentIngestionRelay', () => {
  it('starts ingestion for each document added after the cursor, saves the cursor and continues from it', async () => {
    await documentIngestionRelay({ lastGlobalSeq: 10 });

    expect(world.started).toEqual(['lease', 'tax-return']);
    expect(world.cursors.get('document-ingestion-relay')).toBe(14);
    expect(world.continuedWith).toEqual({ lastGlobalSeq: 14 });
  });

  it('starts from the latest event the first time, leaving earlier documents to the backfill', async () => {
    world.latest = 11;

    await documentIngestionRelay();

    expect(world.started).toEqual(['tax-return']);
  });

  it('sets aside a document whose start keeps failing and moves on', async () => {
    world.failing.add('lease');

    await documentIngestionRelay({ lastGlobalSeq: 10 });

    expect(world.setAside).toEqual([
      { globalSeq: 11, error: 'dr_document not found' },
    ]);
    expect(world.started).toEqual(['tax-return']);
    expect(world.continuedWith).toEqual({ lastGlobalSeq: 14 });
  });

  it('keeps the cursor when nothing new was added', async () => {
    await documentIngestionRelay({ lastGlobalSeq: 14 });

    expect(world.started).toEqual([]);
    expect(world.cursors.has('document-ingestion-relay')).toBe(false);
    expect(world.continuedWith).toEqual({ lastGlobalSeq: 14 });
  });
});
