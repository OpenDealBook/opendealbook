import { beforeEach, describe, expect, it, vi } from 'vitest';

const GENERATED_ID = '00000000-0000-0000-0000-000000000001';

const mocks = vi.hoisted(() => {
  const appendDealEvent = vi.fn(async () => [{ deal_seq: 1, aggregate_seq: 1 }]);
  const appendDealEvents = vi.fn(async () => [
    { deal_seq: 1, aggregate_seq: 1 },
  ]);
  const insertSpy = vi.fn();
  const upsertSpy = vi.fn();
  const deleteSpy = vi.fn();
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
    builder.upsert = (payload: unknown, options: unknown) => {
      upsertSpy(table, payload, options);
      return builder;
    };
    builder.delete = () => {
      deleteSpy(table);
      return builder;
    };
    builder.then = (resolve: (value: unknown) => void) =>
      resolve({ data: dataFor(table), error: null });

    return builder;
  }

  const from = vi.fn((table: string) => makeBuilder(table));

  return {
    appendDealEvent,
    appendDealEvents,
    insertSpy,
    upsertSpy,
    deleteSpy,
    rpcSpy,
    from,
    setStages,
  };
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

import { setDealResolutionSchema } from '../schema/deal.schema';
import {
  addDealParticipant,
  adoptDealFinancials,
  archiveDeal,
  createDeal,
  decideApproval,
  requestApproval,
  setDealListingStatus,
  setDealResolution,
  starDeal,
  unarchiveDeal,
  unstarDeal,
  updateChecklistItemStatus,
  updateDealStage,
  upsertDealBox,
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
const runSetDealResolution = setDealResolution as unknown as Action;
const runArchiveDeal = archiveDeal as unknown as Action;
const runUnarchiveDeal = unarchiveDeal as unknown as Action;
const runSetDealListingStatus = setDealListingStatus as unknown as Action;
const runAdoptDealFinancials = adoptDealFinancials as unknown as Action;
const runStarDeal = starDeal as unknown as Action;
const runUnstarDeal = unstarDeal as unknown as Action;
const runUpsertDealBox = upsertDealBox as unknown as Action;

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

  it('carries profile and capture fields into the deal.created payload when provided', async () => {
    await runCreateDeal(
      {
        account_id: 'account-1',
        description: 'Main Street CPA',
        source: 'marketplace',
        stage: 'sourced',
        industry_id: 'industry-2',
        location_id: 'location-3',
        location_raw: 'Austin, TX',
        employee_band: '10-24',
        website: 'https://example.com',
        owner_role: 'managing_partner',
        reason_for_sale: 'retirement',
        year_established: 1998,
        discovered_at: '2026-01-01T00:00:00.000Z',
        capture_method: 'extension',
      },
      { id: 'user-1' },
    );

    const [, input] = mocks.appendDealEvent.mock.calls.at(-1) as unknown as [
      unknown,
      { payload: Record<string, unknown> },
    ];

    expect(input.payload).toMatchObject({
      industry_id: 'industry-2',
      location_id: 'location-3',
      location_raw: 'Austin, TX',
      employee_band: '10-24',
      website: 'https://example.com',
      owner_role: 'managing_partner',
      reason_for_sale: 'retirement',
      year_established: 1998,
      discovered_at: '2026-01-01T00:00:00.000Z',
      capture_method: 'extension',
    });
  });
});

describe('setDealResolution', () => {
  it('rejects a lost resolution with no reason', () => {
    const result = setDealResolutionSchema.safeParse({
      deal_id: '11111111-1111-4111-8111-111111111111',
      resolution: 'lost',
    });

    expect(result.success).toBe(false);
  });

  it('accepts a lost resolution with a reason', () => {
    const result = setDealResolutionSchema.safeParse({
      deal_id: '11111111-1111-4111-8111-111111111111',
      resolution: 'lost',
      resolution_reason: 'offer_not_accepted',
    });

    expect(result.success).toBe(true);
  });

  it('appends deal.resolved with the resolution and reason', async () => {
    await runSetDealResolution(
      {
        deal_id: 'deal-1',
        resolution: 'lost',
        resolution_reason: 'deal_did_not_close',
      },
      { id: 'user-1' },
    );

    expect(mocks.appendDealEvent).toHaveBeenCalledWith(expect.anything(), {
      dealId: 'deal-1',
      aggregateType: 'deal',
      aggregateId: 'deal-1',
      eventType: 'deal.resolved',
      payload: {
        resolution: 'lost',
        resolution_reason: 'deal_did_not_close',
      },
    });
  });

  it('defaults a won resolution reason to closed', async () => {
    await runSetDealResolution(
      { deal_id: 'deal-1', resolution: 'won' },
      { id: 'user-1' },
    );

    const [, input] = mocks.appendDealEvent.mock.calls.at(-1) as unknown as [
      unknown,
      { payload: Record<string, unknown> },
    ];

    expect(input.payload).toEqual({
      resolution: 'won',
      resolution_reason: 'closed',
    });
  });
});

describe('archiveDeal', () => {
  it('appends a deal.archived event', async () => {
    await runArchiveDeal({ deal_id: 'deal-1' }, { id: 'user-1' });

    expect(mocks.appendDealEvent).toHaveBeenCalledWith(expect.anything(), {
      dealId: 'deal-1',
      aggregateType: 'deal',
      aggregateId: 'deal-1',
      eventType: 'deal.archived',
      payload: {},
    });
  });
});

describe('unarchiveDeal', () => {
  it('appends a deal.unarchived event', async () => {
    await runUnarchiveDeal({ deal_id: 'deal-1' }, { id: 'user-1' });

    expect(mocks.appendDealEvent).toHaveBeenCalledWith(expect.anything(), {
      dealId: 'deal-1',
      aggregateType: 'deal',
      aggregateId: 'deal-1',
      eventType: 'deal.unarchived',
      payload: {},
    });
  });
});

describe('setDealListingStatus', () => {
  it('appends a deal.listing_status_changed event with the status', async () => {
    await runSetDealListingStatus(
      { deal_id: 'deal-1', listing_status: 'sold' },
      { id: 'user-1' },
    );

    expect(mocks.appendDealEvent).toHaveBeenCalledWith(expect.anything(), {
      dealId: 'deal-1',
      aggregateType: 'deal',
      aggregateId: 'deal-1',
      eventType: 'deal.listing_status_changed',
      payload: { listing_status: 'sold' },
    });
  });
});

describe('adoptDealFinancials', () => {
  it('appends a deal.financials_adopted event with the adopted figures', async () => {
    await runAdoptDealFinancials(
      {
        deal_id: 'deal-1',
        adopted_revenue: 1000000,
        adopted_sde: 250000,
        adopted_ebitda: 300000,
        source_calc_version_id: 'calc-9',
      },
      { id: 'user-1' },
    );

    expect(mocks.appendDealEvent).toHaveBeenCalledWith(expect.anything(), {
      dealId: 'deal-1',
      aggregateType: 'deal',
      aggregateId: 'deal-1',
      eventType: 'deal.financials_adopted',
      payload: {
        adopted_revenue: 1000000,
        adopted_sde: 250000,
        adopted_ebitda: 300000,
        source_calc_version_id: 'calc-9',
      },
    });
  });
});

describe('upsertDealBox', () => {
  it('persists min_dscr and required_personal_cash_flow alongside the criteria', async () => {
    await runUpsertDealBox(
      {
        account_id: 'account-1',
        criteria_json: { min_revenue: 500000 },
        min_dscr: 2.25,
        required_personal_cash_flow: 180000,
      },
      { id: 'user-1' },
    );

    const [table, payload] = mocks.insertSpy.mock.calls.at(-1) as unknown as [
      string,
      Record<string, unknown>,
    ];

    expect(table).toBe('deal_box');
    expect(payload).toMatchObject({
      criteria_json: { min_revenue: 500000 },
      min_dscr: 2.25,
      required_personal_cash_flow: 180000,
    });
  });
});

describe('starDeal', () => {
  it('inserts a deal_star row scoped to the current user and the deal account', async () => {
    await runStarDeal({ deal_id: 'deal-1' }, { id: 'user-1' });

    const [table, payload, options] = mocks.upsertSpy.mock.calls.at(
      -1,
    ) as unknown as [
      string,
      Record<string, unknown>,
      Record<string, unknown>,
    ];

    expect(table).toBe('deal_star');
    expect(payload).toEqual({
      user_id: 'user-1',
      deal_id: 'deal-1',
      account_id: 'account-1',
    });
    expect(options).toMatchObject({ ignoreDuplicates: true });
  });
});

describe('unstarDeal', () => {
  it('deletes the deal_star row', async () => {
    await runUnstarDeal({ deal_id: 'deal-1' }, { id: 'user-1' });

    expect(mocks.deleteSpy).toHaveBeenCalledWith('deal_star');
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
