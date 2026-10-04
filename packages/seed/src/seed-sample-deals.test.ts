import { beforeEach, describe, expect, it, vi } from 'vitest';

import { appendDealEvents } from '@odb/events';

import {
  SAMPLE_TAG,
  hasSampleData,
  seedSampleDeals,
} from './seed-sample-deals';

type EventInput = {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  actorKind?: string;
};

type Op =
  | { kind: 'insert'; table: string; rows: Record<string, unknown>[] }
  | { kind: 'events'; dealId: string; events: EventInput[] };

const ops: Op[] = [];
let selectData: unknown[] = [];

const from = vi.fn((table: string) => {
  const builder: Record<string, unknown> = {};

  for (const method of ['select', 'eq', 'ilike', 'limit']) {
    builder[method] = vi.fn(() => builder);
  }

  builder.insert = vi.fn((rows: unknown) => {
    ops.push({
      kind: 'insert',
      table,
      rows: (Array.isArray(rows) ? rows : [rows]) as Record<string, unknown>[],
    });
    return builder;
  });

  builder.then = (resolve: (value: unknown) => unknown) =>
    resolve({ data: selectData, error: null });

  return builder;
});

vi.mock('@odb/supabase/admin', () => ({
  getSupabaseServerAdminClient: () => ({ from }),
}));

vi.mock('@odb/events', () => ({
  appendDealEvent: vi.fn(async () => [{ deal_seq: 1, aggregate_seq: 1 }]),
  appendDealEvents: vi.fn(
    async (_client: unknown, dealId: string, events: EventInput[]) => {
      ops.push({ kind: 'events', dealId, events });
      return [{ deal_seq: 1, aggregate_seq: 1 }];
    },
  ),
}));

const appendDealEventsMock = vi.mocked(appendDealEvents);

function eventBatches(): { dealId: string; events: EventInput[] }[] {
  return ops.filter(
    (op): op is Extract<Op, { kind: 'events' }> => op.kind === 'events',
  );
}

function insertRows(table: string): Record<string, unknown>[] {
  const op = ops.find(
    (candidate): candidate is Extract<Op, { kind: 'insert' }> =>
      candidate.kind === 'insert' && candidate.table === table,
  );
  return op?.rows ?? [];
}

const seedArgs = {
  accountId: '00000000-0000-0000-0000-000000000001',
  userId: '00000000-0000-0000-0000-0000000000aa',
};

const VALID_PIPELINE_STAGE_KEYS = [
  'sourcing',
  'pre_nda',
  'nda_signed',
  'loi_submitted',
  'loi_accepted',
  'due_diligence',
  'pa_submitted',
  'pa_accepted',
  'announcement',
  'integration',
];

describe('seedSampleDeals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ops.length = 0;
    selectData = [];
  });

  it('routes deal-domain writes through ordered per-deal event batches', async () => {
    await seedSampleDeals(seedArgs);

    expect(insertRows('firm')).toHaveLength(4);

    const directDealDomain = ops.filter(
      (op): op is Extract<Op, { kind: 'insert' }> =>
        op.kind === 'insert' &&
        ['deal', 'contract', 'checklist_item', 'dr_document'].includes(
          op.table,
        ),
    );
    expect(directDealDomain).toHaveLength(0);

    const batches = eventBatches();

    const createBatches = batches.filter((batch) =>
      batch.events.some((event) => event.eventType === 'deal.created'),
    );
    expect(createBatches).toHaveLength(4);
    for (const batch of createBatches) {
      expect(batch.events[0]?.eventType).toBe('deal.created');
      expect(batch.events[0]?.aggregateId).toBe(batch.dealId);
      expect(batch.events[0]?.payload.account_id).toBe(seedArgs.accountId);
      expect(batch.events[0]?.payload.owner_user_id).toBe(seedArgs.userId);
    }

    const contractBatch = batches.find((batch) =>
      batch.events.some((event) => event.eventType === 'contract.created'),
    );
    expect(contractBatch?.events.map((event) => event.eventType)).toEqual([
      'deal.created',
      'contract.created',
    ]);

    const checklistBatch = batches.find((batch) =>
      batch.events.some((event) => event.eventType === 'checklist_item.added'),
    );
    expect(checklistBatch?.events[0]?.eventType).toBe('deal.created');
    const added = (checklistBatch?.events ?? []).filter(
      (event) => event.eventType === 'checklist_item.added',
    );
    expect(added.length).toBeGreaterThanOrEqual(6);
    expect(added.some((event) => event.payload.deal_killer === true)).toBe(
      true,
    );
    expect(
      added.every((event) =>
        String(event.payload.title).startsWith(SAMPLE_TAG),
      ),
    ).toBe(true);

    const documentEventIndex = ops.findIndex(
      (op) =>
        op.kind === 'events' &&
        op.events.some((event) => event.eventType === 'dr_document.added'),
    );
    const folderInsertIndex = ops.findIndex(
      (op) => op.kind === 'insert' && op.table === 'dr_folder',
    );
    expect(folderInsertIndex).toBeGreaterThanOrEqual(0);
    expect(documentEventIndex).toBeGreaterThan(folderInsertIndex);

    const documentBatch = ops[documentEventIndex] as Extract<
      Op,
      { kind: 'events' }
    >;
    const documentEvent = documentBatch.events.find(
      (event) => event.eventType === 'dr_document.added',
    );
    const financialsFolder = insertRows('dr_folder').find((folder) =>
      String(folder.name).includes('Financials'),
    );
    expect(documentEvent?.payload.folder_id).toBe(financialsFolder?.id);
  });

  it('stamps every event as the service actor and restores trailing fidelity events', async () => {
    await seedSampleDeals(seedArgs);

    const batches = eventBatches();
    const allEvents = batches.flatMap((batch) => batch.events);
    expect(allEvents.length).toBeGreaterThan(0);
    expect(allEvents.every((event) => event.actorKind === 'service')).toBe(
      true,
    );

    const closedWonBatch = batches.find((batch) =>
      batch.events.some(
        (event) =>
          event.eventType === 'deal.created' &&
          event.payload.stage === 'integration',
      ),
    );
    expect(closedWonBatch?.events[0]?.eventType).toBe('deal.created');
    const closedWonUpdate = closedWonBatch?.events.find(
      (event) => event.eventType === 'deal.updated',
    );
    expect(closedWonUpdate?.payload.close_date).toBe('2026-06-30');
    expect(closedWonUpdate?.aggregateId).toBe(closedWonBatch?.dealId);

    const checklistBatch = batches.find((batch) =>
      batch.events.some((event) => event.eventType === 'checklist_item.added'),
    );
    const firstChecklistItem = checklistBatch?.events.find(
      (event) => event.eventType === 'checklist_item.added',
    );
    const statusChanged = checklistBatch?.events.find(
      (event) => event.eventType === 'checklist_item.status_changed',
    );
    expect(statusChanged?.payload.status).toBe('reviewed');
    expect(statusChanged?.payload.outcome).toBe('accepted');
    expect(statusChanged?.aggregateId).toBe(firstChecklistItem?.aggregateId);
  });

  it('seeds every deal at a stage the default pipeline contains', async () => {
    await seedSampleDeals(seedArgs);

    const createdStages = eventBatches()
      .flatMap((batch) => batch.events)
      .filter((event) => event.eventType === 'deal.created')
      .map((event) => event.payload.stage);

    expect(createdStages).toHaveLength(4);
    for (const stage of createdStages) {
      expect(VALID_PIPELINE_STAGE_KEYS).toContain(stage);
    }
  });

  it('short-circuits a second run when sample data already exists', async () => {
    selectData = [{ id: 'existing-firm' }];

    expect(await hasSampleData(seedArgs.accountId)).toBe(true);

    ops.length = 0;
    await seedSampleDeals(seedArgs);

    expect(ops).toHaveLength(0);
    expect(appendDealEventsMock).not.toHaveBeenCalled();
  });
});
