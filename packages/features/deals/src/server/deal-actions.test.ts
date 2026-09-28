import { beforeEach, describe, expect, it, vi } from 'vitest';

const GENERATED_ID = '00000000-0000-0000-0000-000000000001';

const mocks = vi.hoisted(() => {
  const appendDealEvent = vi.fn(async () => [{ deal_seq: 1, aggregate_seq: 1 }]);
  const appendDealEvents = vi.fn(async () => [
    { deal_seq: 1, aggregate_seq: 1 },
  ]);
  const insertSpy = vi.fn();
  const rpcSpy = vi.fn(async () => ({ data: true, error: null }));

  let stages: Array<{ key: string; sort_order: number }> = [];

  function setStages(next: Array<{ key: string; sort_order: number }>) {
    stages = next;
  }

  function dataFor(table: string): unknown {
    if (table === 'pipeline_stage') {
      return stages;
    }
    if (table === 'deal') {
      return { id: 'deal-1', account_id: 'account-1', stage: 'sourced' };
    }
    if (table === 'approval' || table === 'checklist_item') {
      return { deal_id: 'deal-1' };
    }

    return { id: `${table}-1` };
  }

  function makeBuilder(table: string) {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;

    builder.select = chain;
    builder.eq = chain;
    builder.order = chain;
    builder.limit = chain;
    builder.single = chain;
    builder.maybeSingle = chain;
    builder.throwOnError = chain;
    builder.insert = (payload: unknown) => {
      insertSpy(table, payload);
      return builder;
    };
    builder.then = (resolve: (value: unknown) => void) =>
      resolve({ data: dataFor(table), error: null });

    return builder;
  }

  const from = vi.fn((table: string) => makeBuilder(table));

  return { appendDealEvent, appendDealEvents, insertSpy, rpcSpy, from, setStages };
});

vi.mock('@odb/next/actions', () => ({
  enhanceAction: (fn: unknown) => fn,
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({ from: mocks.from, rpc: mocks.rpcSpy }),
}));

vi.mock('@odb/events', () => ({
  appendDealEvent: mocks.appendDealEvent,
  appendDealEvents: mocks.appendDealEvents,
}));

import {
  addDealParticipant,
  createDeal,
  decideApproval,
  requestApproval,
  updateChecklistItemStatus,
  updateDealStage,
} from './deal-actions';

type Action = (
  data: Record<string, unknown>,
  user: { id: string },
) => Promise<unknown>;

const runCreateDeal = createDeal as unknown as Action;
const runUpdateDealStage = updateDealStage as unknown as Action;
const runAddDealParticipant = addDealParticipant as unknown as Action;
const runRequestApproval = requestApproval as unknown as Action;
const runDecideApproval = decideApproval as unknown as Action;
const runUpdateChecklistItemStatus =
  updateChecklistItemStatus as unknown as Action;

const seededStages = [
  { key: 'sourced', sort_order: 1 },
  { key: 'qualifying', sort_order: 2 },
  { key: 'loi', sort_order: 3 },
  { key: 'diligence', sort_order: 4 },
  { key: 'apa', sort_order: 6 },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.setStages(seededStages);
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(
    GENERATED_ID as ReturnType<typeof crypto.randomUUID>,
  );
});

describe('createDeal', () => {
  it('appends a deal.created event with the projected payload and returns the new id', async () => {
    const result = await runCreateDeal(
      {
        account_id: 'account-1',
        firm_id: 'firm-9',
        description: 'Main Street CPA',
        source: 'manual',
        stage: 'sourced',
      },
      { id: 'user-1' },
    );

    expect(mocks.appendDealEvent).toHaveBeenCalledWith(expect.anything(), {
      dealId: GENERATED_ID,
      aggregateType: 'deal',
      aggregateId: GENERATED_ID,
      eventType: 'deal.created',
      payload: {
        account_id: 'account-1',
        owner_user_id: 'user-1',
        firm_id: 'firm-9',
        description: 'Main Street CPA',
        source: 'manual',
        stage: 'sourced',
      },
    });
    expect(result).toBe(GENERATED_ID);
  });
});

describe('updateDealStage', () => {
  function eventsArg() {
    return mocks.appendDealEvents.mock.calls.at(-1) as unknown as [
      unknown,
      string,
      Array<Record<string, unknown>>,
    ];
  }

  it('records a stage_move audit event on every move', async () => {
    await runUpdateDealStage(
      { deal_id: 'deal-1', stage: 'qualifying' },
      { id: 'user-1' },
    );

    const auditInsert = mocks.insertSpy.mock.calls.find(
      ([table]) => table === 'audit_event',
    );

    expect(auditInsert?.[1]).toMatchObject({
      account_id: 'account-1',
      deal_id: 'deal-1',
      actor_user_id: 'user-1',
      event_type: 'stage_move',
      payload: { from: 'sourced', to: 'qualifying' },
    });
  });

  it('batches only a deal.stage_changed event when no approval is due', async () => {
    await runUpdateDealStage(
      { deal_id: 'deal-1', stage: 'qualifying' },
      { id: 'user-1' },
    );

    const [, dealId, events] = eventsArg();

    expect(dealId).toBe('deal-1');
    expect(events).toEqual([
      {
        aggregateType: 'deal',
        aggregateId: 'deal-1',
        eventType: 'deal.stage_changed',
        payload: { stage: 'qualifying' },
      },
    ]);
  });

  it('adds an approval.requested event when the target is past loi', async () => {
    await runUpdateDealStage(
      { deal_id: 'deal-1', stage: 'diligence' },
      { id: 'user-1' },
    );

    const [, , events] = eventsArg();

    expect(events).toHaveLength(2);
    expect(events[1]).toEqual({
      aggregateType: 'approval',
      aggregateId: GENERATED_ID,
      eventType: 'approval.requested',
      payload: { subject: 'stage_move' },
    });
  });

  it('does not add an approval event when the account has no loi stage', async () => {
    mocks.setStages([
      { key: 'sourced', sort_order: 1 },
      { key: 'diligence', sort_order: 4 },
      { key: 'apa', sort_order: 6 },
    ]);

    await runUpdateDealStage(
      { deal_id: 'deal-1', stage: 'apa' },
      { id: 'user-1' },
    );

    const [, , events] = eventsArg();

    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe('deal.stage_changed');
  });
});

describe('addDealParticipant', () => {
  it('appends a deal_participant.added event with the mapped payload', async () => {
    await runAddDealParticipant(
      {
        deal_id: 'deal-1',
        user_id: 'user-9',
        party: 'buyer',
        role: 'advisor',
        scope: 'deal',
        permission: 'view',
        expires_at: '2026-01-01T00:00:00.000Z',
      },
      { id: 'user-1' },
    );

    expect(mocks.appendDealEvent).toHaveBeenCalledWith(expect.anything(), {
      dealId: 'deal-1',
      aggregateType: 'deal_participant',
      aggregateId: GENERATED_ID,
      eventType: 'deal_participant.added',
      payload: {
        user_id: 'user-9',
        party: 'buyer',
        role: 'advisor',
        scope: 'deal',
        permission: 'view',
        expires_at: '2026-01-01T00:00:00.000Z',
      },
    });
  });
});

describe('requestApproval', () => {
  it('appends an approval.requested event with the subject payload', async () => {
    await runRequestApproval(
      { deal_id: 'deal-1', subject: 'stage_move' },
      { id: 'user-1' },
    );

    expect(mocks.appendDealEvent).toHaveBeenCalledWith(expect.anything(), {
      dealId: 'deal-1',
      aggregateType: 'approval',
      aggregateId: GENERATED_ID,
      eventType: 'approval.requested',
      payload: { subject: 'stage_move' },
    });
  });
});

describe('decideApproval', () => {
  it('resolves the deal from the approval and appends approval.decided', async () => {
    await runDecideApproval(
      { id: 'approval-7', decision: 'approved' },
      { id: 'user-1' },
    );

    expect(mocks.appendDealEvent).toHaveBeenCalledWith(expect.anything(), {
      dealId: 'deal-1',
      aggregateType: 'approval',
      aggregateId: 'approval-7',
      eventType: 'approval.decided',
      payload: { decision: 'approved' },
    });
  });
});

describe('updateChecklistItemStatus', () => {
  it('appends checklist_item.status_changed and stamps the matching timestamp', async () => {
    await runUpdateChecklistItemStatus(
      { id: 'item-3', status: 'received' },
      { id: 'user-1' },
    );

    const [, input] = mocks.appendDealEvent.mock.calls.at(-1) as unknown as [
      unknown,
      {
        dealId: string;
        aggregateType: string;
        aggregateId: string;
        eventType: string;
        payload: Record<string, unknown>;
      },
    ];

    expect(input.dealId).toBe('deal-1');
    expect(input.aggregateType).toBe('checklist_item');
    expect(input.aggregateId).toBe('item-3');
    expect(input.eventType).toBe('checklist_item.status_changed');
    expect(input.payload.status).toBe('received');
    expect(input.payload.received_at).toBeTruthy();
    expect(input.payload.reviewed_at).toBeUndefined();
  });
});
