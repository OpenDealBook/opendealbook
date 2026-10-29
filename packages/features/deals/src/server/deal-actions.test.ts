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
  const rpcSpy = vi.fn((name: string) => {
    const result: { data: unknown; error: unknown } = {
      data: name === 'deal_people' ? [] : true,
      error: null,
    };
    return Object.assign(Promise.resolve(result), {
      throwOnError: async () => result,
    });
  });

  let stages: Array<{ key: string; sort_order: number }> = [];

  function setStages(next: Array<{ key: string; sort_order: number }>) {
    stages = next;
  }

  function dataFor(table: string): unknown {
    if (table === 'pipeline_stage') {
      return stages;
    }
    if (table === 'deal') {
      return { id: '6221ddef-b8e9-484f-8bb8-0967d8e16a30', account_id: 'd189aa4d-3d82-46d6-8967-4a2079217dfb', stage: 'sourced' };
    }
    if (table === 'approval' || table === 'checklist_item') {
      return { deal_id: '6221ddef-b8e9-484f-8bb8-0967d8e16a30' };
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
  enhanceAction:
    (fn: (data: unknown, user: { id: string }) => unknown) =>
    (data: unknown, user?: { id: string }) =>
      fn(data, user ?? { id: 'user-1' }),
}));

const removal = vi.hoisted(() => {
  const removed: Array<{ bucket: string; path: string }> = [];
  const failingBuckets = new Set<string>();
  const remove = (bucket: string) => async (paths: string[]) => {
    if (failingBuckets.has(`throws:${bucket}`)) {
      throw new Error(`storage is unreachable for ${bucket}`);
    }
    if (paths.length > 1000 || failingBuckets.has(bucket)) {
      return { data: null, error: { message: `could not remove from ${bucket}` } };
    }
    removed.push(...paths.map((path) => ({ bucket, path })));
    return { data: [], error: null };
  };
  const adminRpc = vi.fn((_name: string, _args: unknown) => {
    const result = { data: null, error: null };
    return Object.assign(Promise.resolve(result), {
      throwOnError: async () => result,
    });
  });
  const cancelRuns = vi.fn(async (_runIds: string[]) => ({
    cancelled: [] as string[],
    unreached: [] as string[],
  }));
  const triggerNotification = vi.fn(
    async (_deps: unknown, _input: { recipientUserId: string }) => ['email'],
  );
  const logError = vi.fn();
  const createNovuClient = vi.fn(() => ({}));

  return {
    removed,
    failingBuckets,
    storage: { from: (bucket: string) => ({ remove: remove(bucket) }) },
    adminRpc,
    cancelRuns,
    triggerNotification,
    logError,
    createNovuClient,
  };
});

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({ from: mocks.from, rpc: mocks.rpcSpy }),
  getSupabaseServerAdminClient: () => ({
    rpc: removal.adminRpc,
    storage: removal.storage,
  }),
}));

vi.mock('@odb/workflows/builder/client', () => ({
  cancelRuns: removal.cancelRuns,
}));

vi.mock('@odb/notifications/server', () => ({
  createNovuClient: removal.createNovuClient,
  triggerNotification: removal.triggerNotification,
}));

vi.mock('@odb/shared/logger', () => ({
  getLogger: () => ({ error: removal.logError }),
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
  decideApproval,
  deleteDeal,
  requestApproval,
  setDealListingStatus,
  setDealResolution,
  setEarningsBasis,
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

const runUpdateDealStage = updateDealStage as unknown as Action;
const runAddDealParticipant = addDealParticipant as unknown as Action;
const runRequestApproval = requestApproval as unknown as Action;
const runDecideApproval = decideApproval as unknown as Action;
const runUpdateChecklistItemStatus =
  updateChecklistItemStatus as unknown as Action;
const runSetDealResolution = setDealResolution as unknown as Action;
const runArchiveDeal = archiveDeal as unknown as Action;
const runUnarchiveDeal = unarchiveDeal as unknown as Action;
const runDeleteDeal = deleteDeal as unknown as Action;
const runSetDealListingStatus = setDealListingStatus as unknown as Action;
const runSetEarningsBasis = setEarningsBasis as unknown as Action;
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
        deal_id: '6221ddef-b8e9-484f-8bb8-0967d8e16a30',
        resolution: 'lost',
        resolution_reason: 'deal_did_not_close',
      },
      { id: 'user-1' },
    );

    expect(mocks.appendDealEvent).toHaveBeenCalledWith(expect.anything(), {
      dealId: '6221ddef-b8e9-484f-8bb8-0967d8e16a30',
      aggregateType: 'deal',
      aggregateId: '6221ddef-b8e9-484f-8bb8-0967d8e16a30',
      eventType: 'deal.resolved',
      payload: {
        resolution: 'lost',
        resolution_reason: 'deal_did_not_close',
      },
    });
  });

  it('defaults a won resolution reason to closed', async () => {
    await runSetDealResolution(
      { deal_id: '6221ddef-b8e9-484f-8bb8-0967d8e16a30', resolution: 'won' },
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
    await runArchiveDeal({ deal_id: '6221ddef-b8e9-484f-8bb8-0967d8e16a30' }, { id: 'user-1' });

    expect(mocks.appendDealEvent).toHaveBeenCalledWith(expect.anything(), {
      dealId: '6221ddef-b8e9-484f-8bb8-0967d8e16a30',
      aggregateType: 'deal',
      aggregateId: '6221ddef-b8e9-484f-8bb8-0967d8e16a30',
      eventType: 'deal.archived',
      payload: {},
    });
  });
  it('returns a named refusal to someone who does not manage the deal', async () => {
    mocks.appendDealEvent.mockRejectedValueOnce({
      code: '42501',
      message: 'not authorized to append deal.archived on deal 6221ddef: needs deals.manage',
    });

    const result = await runArchiveDeal(
      { deal_id: '6221ddef-b8e9-484f-8bb8-0967d8e16a30' },
      { id: 'user-1' },
    );

    expect(result).toEqual({
      ok: false,
      refusal: 'Only deal managers can archive deals. Ask a deal manager.',
    });
  });
});

describe('unarchiveDeal', () => {
  it('appends a deal.unarchived event', async () => {
    await runUnarchiveDeal({ deal_id: '6221ddef-b8e9-484f-8bb8-0967d8e16a30' }, { id: 'user-1' });

    expect(mocks.appendDealEvent).toHaveBeenCalledWith(expect.anything(), {
      dealId: '6221ddef-b8e9-484f-8bb8-0967d8e16a30',
      aggregateType: 'deal',
      aggregateId: '6221ddef-b8e9-484f-8bb8-0967d8e16a30',
      eventType: 'deal.unarchived',
      payload: {},
    });
  });
});

describe('deleteDeal', () => {
  const dealId = '6221ddef-b8e9-484f-8bb8-0967d8e16a30';
  const accountId = 'd189aa4d-3d82-46d6-8967-4a2079217dfb';

  function deleted(overrides: Record<string, unknown>) {
    const result = {
      data: {
        account_id: accountId,
        deal_id: dealId,
        team_name: 'Acme Partners',
        files: [],
        run_ids: [],
        recipients: [],
        ...overrides,
      },
      error: null,
    };
    mocks.rpcSpy.mockImplementationOnce(() =>
      Object.assign(Promise.resolve(result), {
        throwOnError: async () => result,
      }),
    );
  }

  beforeEach(() => {
    removal.removed.length = 0;
    removal.failingBuckets.clear();
    removal.triggerNotification.mockImplementation(async () => ['email']);
    vi.stubEnv('NOVU_API_KEY', 'novu-key');
    vi.stubEnv('NOVU_API_URL', 'https://novu.test');
  });

  it('passes on the reason the database refused the delete', async () => {
    const refused = {
      data: null,
      error: { code: 'ODB02', message: 'Archive the deal before deleting it.' },
    };
    mocks.rpcSpy.mockImplementationOnce(() =>
      Object.assign(Promise.resolve(refused), {
        throwOnError: async () => refused,
      }),
    );

    const result = await runDeleteDeal(
      { deal_id: dealId, confirm_name: 'Harbor Plumbing' },
      { id: 'user-1' },
    );

    expect(result).toEqual({
      ok: false,
      refusal: 'Archive the deal before deleting it.',
    });
  });

  it('removes every file of a deal with more files than storage removes at once', async () => {
    const files = Array.from({ length: 1001 }, (_, index) => ({
      bucket: 'data-room',
      path: `deal/${dealId}/${index}.pdf`,
    }));
    deleted({ files });

    const result = await runDeleteDeal(
      { deal_id: dealId, confirm_name: 'Harbor Plumbing' },
      { id: 'user-1' },
    );

    expect(result).toEqual({ ok: true, value: undefined });
    expect(removal.removed).toEqual(files);
    expect(removal.adminRpc).not.toHaveBeenCalled();
  });

  it('tells each outside party by the name they know the deal by', async () => {
    deleted({
      recipients: [
        { user_id: 'lender-1', email: 'lender@bank.test', deal_name: 'Project Pipe' },
        { user_id: 'seller-1', email: 'sam@harbor.test', deal_name: 'Harbor Plumbing' },
      ],
    });

    await runDeleteDeal(
      { deal_id: dealId, confirm_name: 'Harbor Plumbing' },
      { id: 'user-1' },
    );

    expect(removal.triggerNotification.mock.calls.map(([, input]) => input)).toEqual([
      {
        eventType: 'deal.deleted',
        recipientUserId: 'lender-1',
        email: 'lender@bank.test',
        payload: { teamName: 'Acme Partners', dealName: 'Project Pipe' },
      },
      {
        eventType: 'deal.deleted',
        recipientUserId: 'seller-1',
        email: 'sam@harbor.test',
        payload: { teamName: 'Acme Partners', dealName: 'Harbor Plumbing' },
      },
    ]);
  });

  it('records and logs the files, runs and emails it could not clean up after the delete', async () => {
    const kept = { bucket: 'data-room', path: `deal/${dealId}/kept.pdf` };
    const stuck = { bucket: 'contracts', path: 'team/c1/v1.pdf' };
    const unreached = { user_id: 'seller-1', email: 'sam@harbor.test', deal_name: 'Harbor Plumbing' };
    deleted({
      files: [kept, stuck],
      run_ids: ['run-1', 'run-2'],
      recipients: [
        { user_id: 'lender-1', email: 'lender@bank.test', deal_name: 'Project Pipe' },
        unreached,
      ],
    });
    removal.failingBuckets.add('contracts');
    removal.cancelRuns.mockResolvedValueOnce({
      cancelled: ['run-1'],
      unreached: ['run-2'],
    });
    removal.triggerNotification.mockImplementation(async (_deps, input) => {
      if (input.recipientUserId === 'seller-1') {
        throw new Error('Novu is down');
      }
      return ['email'];
    });

    const result = await runDeleteDeal(
      { deal_id: dealId, confirm_name: 'Harbor Plumbing' },
      { id: 'user-1' },
    );

    const leftovers = { files: [stuck], run_ids: ['run-2'], recipients: ['seller-1'] };
    expect(result).toEqual({ ok: true, value: undefined });
    expect(removal.removed).toEqual([kept]);
    expect(removal.cancelRuns).toHaveBeenCalledWith(['run-1', 'run-2']);
    expect(removal.adminRpc).toHaveBeenCalledWith('record_deal_delete_cleanup_failed', {
      p_account_id: accountId,
      p_deal_id: dealId,
      p_leftovers: leftovers,
    });
    expect(removal.logError).toHaveBeenCalledWith(
      {
        dealId,
        leftovers,
        errors: ['could not remove from contracts', 'Novu is down'],
      },
      'Deal deleted, but its cleanup did not finish',
    );
  });

  it('still emails everyone and records every run when cancelling throws', async () => {
    deleted({
      run_ids: ['run-1', 'run-2'],
      recipients: [
        { user_id: 'lender-1', email: 'lender@bank.test', deal_name: 'Project Pipe' },
      ],
    });
    removal.cancelRuns.mockRejectedValueOnce(new Error('workflow_run update failed'));

    const result = await runDeleteDeal(
      { deal_id: dealId, confirm_name: 'Harbor Plumbing' },
      { id: 'user-1' },
    );

    expect(result).toEqual({ ok: true, value: undefined });
    expect(removal.triggerNotification).toHaveBeenCalledTimes(1);
    expect(removal.adminRpc).toHaveBeenCalledWith('record_deal_delete_cleanup_failed', {
      p_account_id: accountId,
      p_deal_id: dealId,
      p_leftovers: { files: [], run_ids: ['run-1', 'run-2'], recipients: [] },
    });
  });

  it('records every outside recipient as not notified when email is not set up', async () => {
    vi.stubEnv('NOVU_API_KEY', '');
    deleted({
      recipients: [
        { user_id: 'lender-1', email: 'lender@bank.test', deal_name: 'Project Pipe' },
        { user_id: 'seller-1', email: 'sam@harbor.test', deal_name: 'Harbor Plumbing' },
      ],
    });

    await runDeleteDeal(
      { deal_id: dealId, confirm_name: 'Harbor Plumbing' },
      { id: 'user-1' },
    );

    expect(removal.triggerNotification).not.toHaveBeenCalled();
    expect(removal.adminRpc).toHaveBeenCalledWith('record_deal_delete_cleanup_failed', {
      p_account_id: accountId,
      p_deal_id: dealId,
      p_leftovers: { files: [], run_ids: [], recipients: ['lender-1', 'seller-1'] },
    });
    expect(removal.logError).toHaveBeenCalledWith(
      expect.objectContaining({ errors: ['Email is not set up'] }),
      'Deal deleted, but its cleanup did not finish',
    );
  });

  it('logs the message of each cleanup step that threw', async () => {
    deleted({ run_ids: ['run-1'] });
    removal.cancelRuns.mockRejectedValueOnce(new Error('workflow_run update failed'));

    await runDeleteDeal(
      { deal_id: dealId, confirm_name: 'Harbor Plumbing' },
      { id: 'user-1' },
    );

    expect(removal.logError).toHaveBeenCalledWith(
      {
        dealId,
        leftovers: { files: [], run_ids: ['run-1'], recipients: [] },
        errors: ['workflow_run update failed'],
      },
      'Deal deleted, but its cleanup did not finish',
    );
  });

  it('records every recipient when the email client cannot be made', async () => {
    deleted({
      recipients: [
        { user_id: 'lender-1', email: 'lender@bank.test', deal_name: 'Project Pipe' },
      ],
    });
    removal.createNovuClient.mockImplementationOnce(() => {
      throw new Error('Missing required environment variable: NOVU_API_KEY');
    });

    const result = await runDeleteDeal(
      { deal_id: dealId, confirm_name: 'Harbor Plumbing' },
      { id: 'user-1' },
    );

    expect(result).toEqual({ ok: true, value: undefined });
    expect(removal.adminRpc).toHaveBeenCalledWith('record_deal_delete_cleanup_failed', {
      p_account_id: accountId,
      p_deal_id: dealId,
      p_leftovers: { files: [], run_ids: [], recipients: ['lender-1'] },
    });
  });

  it('records the files of a storage call that throws', async () => {
    const file = { bucket: 'data-room', path: `deal/${dealId}/a.pdf` };
    deleted({ files: [file] });
    removal.failingBuckets.add('throws:data-room');

    const result = await runDeleteDeal(
      { deal_id: dealId, confirm_name: 'Harbor Plumbing' },
      { id: 'user-1' },
    );

    expect(result).toEqual({ ok: true, value: undefined });
    expect(removal.adminRpc).toHaveBeenCalledWith('record_deal_delete_cleanup_failed', {
      p_account_id: accountId,
      p_deal_id: dealId,
      p_leftovers: { files: [file], run_ids: [], recipients: [] },
    });
  });

  it('says the deal was deleted when its cleanup list cannot be read', async () => {
    const result = { data: { deal_id: dealId }, error: null };
    mocks.rpcSpy.mockImplementationOnce(() =>
      Object.assign(Promise.resolve(result), {
        throwOnError: async () => result,
      }),
    );

    await expect(
      runDeleteDeal(
        { deal_id: dealId, confirm_name: 'Harbor Plumbing' },
        { id: 'user-1' },
      ),
    ).rejects.toThrow(`Deal ${dealId} was deleted, but its cleanup list could not be read`);
  });
});

describe('setDealListingStatus', () => {
  it('appends a deal.listing_status_changed event with the status', async () => {
    await runSetDealListingStatus(
      { deal_id: '6221ddef-b8e9-484f-8bb8-0967d8e16a30', listing_status: 'sold' },
      { id: 'user-1' },
    );

    expect(mocks.appendDealEvent).toHaveBeenCalledWith(expect.anything(), {
      dealId: '6221ddef-b8e9-484f-8bb8-0967d8e16a30',
      aggregateType: 'deal',
      aggregateId: '6221ddef-b8e9-484f-8bb8-0967d8e16a30',
      eventType: 'deal.listing_status_changed',
      payload: { listing_status: 'sold' },
    });
  });
});

describe('setEarningsBasis', () => {
  it('appends a deal.earnings_basis_changed event with the basis', async () => {
    await runSetEarningsBasis(
      { deal_id: '6221ddef-b8e9-484f-8bb8-0967d8e16a30', earnings_basis: 'ebitda' },
      { id: 'user-1' },
    );

    expect(mocks.appendDealEvent).toHaveBeenCalledWith(expect.anything(), {
      dealId: '6221ddef-b8e9-484f-8bb8-0967d8e16a30',
      aggregateType: 'deal',
      aggregateId: '6221ddef-b8e9-484f-8bb8-0967d8e16a30',
      eventType: 'deal.earnings_basis_changed',
      payload: { earnings_basis: 'ebitda' },
    });
  });

  it('returns a named refusal when the caller lacks deals.manage', async () => {
    mocks.appendDealEvent.mockRejectedValueOnce({ code: '42501' });

    const result = await runSetEarningsBasis(
      { deal_id: '6221ddef-b8e9-484f-8bb8-0967d8e16a30', earnings_basis: 'ebitda' },
      { id: 'user-1' },
    );

    expect(result).toEqual({
      ok: false,
      refusal:
        'Only deal managers can change the earnings basis. Ask a deal manager.',
    });
  });
});

describe('adoptDealFinancials', () => {
  it('appends a deal.financials_adopted event with the adopted figures', async () => {
    await runAdoptDealFinancials(
      {
        deal_id: '6221ddef-b8e9-484f-8bb8-0967d8e16a30',
        adopted_revenue: 1000000,
        adopted_sde: 250000,
        adopted_ebitda: 300000,
        source_calc_version_id: '4cabc7b9-2dfa-43b1-8665-b393543954c7',
      },
      { id: 'user-1' },
    );

    expect(mocks.appendDealEvent).toHaveBeenCalledWith(expect.anything(), {
      dealId: '6221ddef-b8e9-484f-8bb8-0967d8e16a30',
      aggregateType: 'deal',
      aggregateId: '6221ddef-b8e9-484f-8bb8-0967d8e16a30',
      eventType: 'deal.financials_adopted',
      payload: {
        adopted_revenue: 1000000,
        adopted_sde: 250000,
        adopted_ebitda: 300000,
        adopted_years: null,
        source_calc_version_id: '4cabc7b9-2dfa-43b1-8665-b393543954c7',
      },
    });
  });
});

describe('adoptDealFinancials refusal', () => {
  it('names who can adopt financials when the caller cannot', async () => {
    mocks.appendDealEvent.mockRejectedValueOnce({
      code: '42501',
      message: 'not authorized to append deal.financials_adopted on deal: needs deals.manage',
    });

    expect(
      await runAdoptDealFinancials(
        { deal_id: '6221ddef-b8e9-484f-8bb8-0967d8e16a30', adopted_revenue: 1000000 },
        { id: 'user-1' },
      ),
    ).toEqual({
      ok: false,
      refusal: 'Only deal managers can adopt financials. Ask a deal manager.',
    });
  });
});

describe('upsertDealBox', () => {
  it('persists min_dscr and required_personal_cash_flow alongside the criteria', async () => {
    await runUpsertDealBox(
      {
        account_id: 'd189aa4d-3d82-46d6-8967-4a2079217dfb',
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
    await runStarDeal({ deal_id: '6221ddef-b8e9-484f-8bb8-0967d8e16a30' }, { id: 'user-1' });

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
      deal_id: '6221ddef-b8e9-484f-8bb8-0967d8e16a30',
      account_id: 'd189aa4d-3d82-46d6-8967-4a2079217dfb',
    });
    expect(options).toMatchObject({ ignoreDuplicates: true });
  });
});

describe('unstarDeal', () => {
  it('deletes the deal_star row', async () => {
    await runUnstarDeal({ deal_id: '6221ddef-b8e9-484f-8bb8-0967d8e16a30' }, { id: 'user-1' });

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
      { deal_id: '6221ddef-b8e9-484f-8bb8-0967d8e16a30', stage: 'qualifying' },
      { id: 'user-1' },
    );

    const [, dealId, events] = eventsArg();

    expect(dealId).toBe('6221ddef-b8e9-484f-8bb8-0967d8e16a30');
    expect(events).toEqual([
      {
        aggregateType: 'deal',
        aggregateId: '6221ddef-b8e9-484f-8bb8-0967d8e16a30',
        eventType: 'deal.stage_changed',
        payload: { stage: 'qualifying' },
      },
    ]);
  });

  it('adds an approval.requested event when the target is past loi', async () => {
    await runUpdateDealStage(
      { deal_id: '6221ddef-b8e9-484f-8bb8-0967d8e16a30', stage: 'diligence' },
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
      { deal_id: '6221ddef-b8e9-484f-8bb8-0967d8e16a30', stage: 'apa' },
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
        deal_id: '6221ddef-b8e9-484f-8bb8-0967d8e16a30',
        user_id: '9b1f7c0e-2a4d-4c3b-8e5f-6a7b8c9d0e1f',
        party: 'buyer',
        role: 'advisor',
        scope: 'deal',
        permission: 'view',
        expires_at: '2026-01-01T00:00:00.000Z',
      },
      { id: 'user-1' },
    );

    expect(mocks.appendDealEvent).toHaveBeenCalledWith(expect.anything(), {
      dealId: '6221ddef-b8e9-484f-8bb8-0967d8e16a30',
      aggregateType: 'deal_participant',
      aggregateId: GENERATED_ID,
      eventType: 'deal_participant.added',
      payload: {
        user_id: '9b1f7c0e-2a4d-4c3b-8e5f-6a7b8c9d0e1f',
        party: 'buyer',
        role: 'advisor',
        scope: 'deal',
        permission: 'view',
        expires_at: '2026-01-01T00:00:00.000Z',
      },
    });
  });
});

describe('addDealParticipant refusal', () => {
  it('refuses a caller who cannot manage participants and records nothing', async () => {
    mocks.rpcSpy.mockResolvedValueOnce({ data: false, error: null });

    const result = await runAddDealParticipant(
      {
        deal_id: '6221ddef-b8e9-484f-8bb8-0967d8e16a30',
        user_id: '9b1f7c0e-2a4d-4c3b-8e5f-6a7b8c9d0e1f',
        party: 'buyer',
      },
      { id: 'user-1' },
    );

    expect(result).toEqual({
      ok: false,
      refusal: 'Only deal managers can add people to a deal.',
    });
    expect(mocks.appendDealEvent).not.toHaveBeenCalled();
  });
});

describe('approval refusals', () => {
  function refuseAppend() {
    mocks.appendDealEvent.mockRejectedValueOnce({
      code: '42501',
      message: 'not authorized to append approval.requested on deal: needs deals.manage',
    });
  }

  it('names who can request an approval when the caller cannot', async () => {
    refuseAppend();

    const result = await runRequestApproval(
      { deal_id: '6221ddef-b8e9-484f-8bb8-0967d8e16a30', subject: 'stage_move' },
      { id: 'user-1' },
    );

    expect(result).toEqual({
      ok: false,
      refusal: 'Only deal managers can request approvals. Ask a deal manager.',
    });
  });

  it('names who can decide an approval when the caller cannot', async () => {
    refuseAppend();

    const result = await runDecideApproval(
      { id: '7a0c1d2e-3f4a-4b5c-8d6e-7f8a9b0c1d2e', decision: 'approved' },
      { id: 'user-1' },
    );

    expect(result).toEqual({
      ok: false,
      refusal: 'Only deal managers can decide approvals. Ask a deal manager.',
    });
  });
});

describe('requestApproval', () => {
  it('appends an approval.requested event with the subject payload', async () => {
    await runRequestApproval(
      { deal_id: '6221ddef-b8e9-484f-8bb8-0967d8e16a30', subject: 'stage_move' },
      { id: 'user-1' },
    );

    expect(mocks.appendDealEvent).toHaveBeenCalledWith(expect.anything(), {
      dealId: '6221ddef-b8e9-484f-8bb8-0967d8e16a30',
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
      { id: '7a0c1d2e-3f4a-4b5c-8d6e-7f8a9b0c1d2e', decision: 'approved' },
      { id: 'user-1' },
    );

    expect(mocks.appendDealEvent).toHaveBeenCalledWith(expect.anything(), {
      dealId: '6221ddef-b8e9-484f-8bb8-0967d8e16a30',
      aggregateType: 'approval',
      aggregateId: '7a0c1d2e-3f4a-4b5c-8d6e-7f8a9b0c1d2e',
      eventType: 'approval.decided',
      payload: { decision: 'approved' },
    });
  });
});

describe('updateChecklistItemStatus', () => {
  it('appends checklist_item.status_changed and stamps the matching timestamp', async () => {
    await runUpdateChecklistItemStatus(
      { id: '5f675954-8b8a-402f-856d-555c3b0635f5', status: 'received' },
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

    expect(input.dealId).toBe('6221ddef-b8e9-484f-8bb8-0967d8e16a30');
    expect(input.aggregateType).toBe('checklist_item');
    expect(input.aggregateId).toBe('5f675954-8b8a-402f-856d-555c3b0635f5');
    expect(input.eventType).toBe('checklist_item.status_changed');
    expect(input.payload.status).toBe('received');
    expect(input.payload.received_at).toBeTruthy();
    expect(input.payload.reviewed_at).toBeUndefined();
  });
});
