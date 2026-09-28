import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const insertSpy = vi.fn();
  const updateSpy = vi.fn();

  let stages: Array<{ key: string; sort_order: number }> = [];

  function setStages(next: Array<{ key: string; sort_order: number }>) {
    stages = next;
  }

  function dataFor(table: string): unknown {
    if (table === 'deal_box') {
      return { version: 3 };
    }
    if (table === 'pipeline_stage') {
      return stages;
    }
    if (table === 'deal') {
      return { id: 'deal-1', account_id: 'account-1', stage: 'sourced' };
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
    builder.update = (payload: unknown) => {
      updateSpy(table, payload);
      return builder;
    };
    builder.then = (resolve: (value: unknown) => void) =>
      resolve({ data: dataFor(table), error: null });

    return builder;
  }

  const from = vi.fn((table: string) => makeBuilder(table));

  return { insertSpy, updateSpy, from, setStages };
});

vi.mock('@odb/next/actions', () => ({
  enhanceAction: (fn: unknown) => fn,
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({ from: mocks.from }),
}));

import {
  createDeal,
  updateChecklistItemStatus,
  updateDealStage,
} from './deal-actions';

const runCreateDeal = createDeal as unknown as (
  data: Record<string, unknown>,
  user: { id: string },
) => Promise<unknown>;

const runUpdateChecklistItemStatus = updateChecklistItemStatus as unknown as (
  data: Record<string, unknown>,
  user: { id: string },
) => Promise<unknown>;

const runUpdateDealStage = updateDealStage as unknown as (
  data: Record<string, unknown>,
  user: { id: string },
) => Promise<unknown>;

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
});

describe('createDeal', () => {
  it('stamps account_id, owner_user_id and the current deal_box version', async () => {
    await runCreateDeal(
      { account_id: 'account-1', source: 'manual', stage: 'sourced' },
      { id: 'user-1' },
    );

    const dealInsert = mocks.insertSpy.mock.calls.find(
      ([table]) => table === 'deal',
    );

    expect(dealInsert?.[1]).toMatchObject({
      account_id: 'account-1',
      owner_user_id: 'user-1',
      deal_box_version: 3,
    });
  });
});

describe('updateChecklistItemStatus', () => {
  it('sets received_at when transitioning to received', async () => {
    await runUpdateChecklistItemStatus(
      { id: 'item-1', status: 'received' },
      { id: 'user-1' },
    );

    const [, payload] = mocks.updateSpy.mock.calls.at(-1) as [
      string,
      Record<string, unknown>,
    ];

    expect(payload.status).toBe('received');
    expect(payload.received_at).toBeTruthy();
    expect(payload.reviewed_at).toBeUndefined();
  });
});

describe('updateDealStage', () => {
  function approvalInserts() {
    return mocks.insertSpy.mock.calls.filter(([table]) => table === 'approval');
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

  it('requests approval when the target sort_order is past the loi stage', async () => {
    await runUpdateDealStage(
      { deal_id: 'deal-1', stage: 'diligence' },
      { id: 'user-1' },
    );

    expect(approvalInserts()).toHaveLength(1);
    expect(approvalInserts()[0]?.[1]).toMatchObject({
      deal_id: 'deal-1',
      subject: 'stage_move',
      requested_by: 'user-1',
    });
  });

  it('does not request approval when the target sort_order is at or before loi', async () => {
    await runUpdateDealStage(
      { deal_id: 'deal-1', stage: 'qualifying' },
      { id: 'user-1' },
    );

    expect(approvalInserts()).toHaveLength(0);
  });

  it('does not request approval when the account has no loi stage', async () => {
    mocks.setStages([
      { key: 'sourced', sort_order: 1 },
      { key: 'diligence', sort_order: 4 },
      { key: 'apa', sort_order: 6 },
    ]);

    await runUpdateDealStage(
      { deal_id: 'deal-1', stage: 'apa' },
      { id: 'user-1' },
    );

    expect(approvalInserts()).toHaveLength(0);
  });
});
