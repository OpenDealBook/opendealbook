import { beforeEach, describe, expect, it, vi } from 'vitest';

const GENERATED_ID = '00000000-0000-0000-0000-000000000001';
const round2 = (value: number) => Number(value.toFixed(2));

const mocks = vi.hoisted(() => {
  const appendDealEvent = vi.fn(async () => [{ deal_seq: 1, aggregate_seq: 1 }]);
  const insertSpy = vi.fn();
  const upsertSpy = vi.fn();
  const updateSpy = vi.fn();
  const deleteSpy = vi.fn();

  let responses: Record<string, unknown> = {};

  function setResponses(next: Record<string, unknown>) {
    responses = next;
  }

  function dataFor(table: string): unknown {
    if (table in responses) {
      return responses[table];
    }
    return { id: `${table}-1` };
  }

  function makeBuilder(table: string) {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;

    builder.select = chain;
    builder.eq = chain;
    builder.neq = chain;
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
    builder.update = (payload: unknown) => {
      updateSpy(table, payload);
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
    insertSpy,
    upsertSpy,
    updateSpy,
    deleteSpy,
    from,
    setResponses,
  };
});

vi.mock('@odb/next/actions', () => ({
  enhanceAction: (fn: unknown) => fn,
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({ from: mocks.from }),
}));

vi.mock('@odb/events', () => ({
  appendDealEvent: mocks.appendDealEvent,
  appendDealEvents: vi.fn(),
}));

import {
  adoptCalcVersion,
  createCalcVersion,
  deleteCalcVersion,
  duplicateCalcVersion,
  markPrimaryCalcVersion,
  saveDealCalc,
  saveSdeCalc,
  saveWorkingCapitalCalc,
} from './calc-actions';

type Action = (
  data: Record<string, unknown>,
  user: { id: string },
) => Promise<unknown>;

const user = { id: 'user-1' };

function calcVersionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'calc_version-1',
    account_id: 'account-1',
    deal_id: 'deal-1',
    type: 'sde',
    name: 'Base case',
    notes: null,
    is_primary: false,
    outputs_snapshot: {},
    ...overrides,
  };
}

const referenceSdePeriods = [
  { label: 'Two years ago', weight: 0.2, lines: [{ line_code: 'sales', amount: 0 }] },
  {
    label: 'Last year',
    weight: 0.3,
    lines: [{ line_code: 'sales', amount: 561_646 }],
  },
  {
    label: 'Stub',
    weight: 0.5,
    months: 3,
    lines: [{ line_code: 'sales', amount: 169_591 }],
  },
];

const referenceDealInputs = {
  pl: {
    sales: 163_000,
    cogs: 0,
    opex: 0,
    depreciation_amortization: 0,
    taxes: 0,
    interest: 0,
    owner_benefits: 0,
  },
  purchase_price: 619_150,
  closing_costs: 41_000,
  annual_growth: 0,
  required_personal_cash_flow: 100_000,
  dscr_mode: 'tax_adjusted',
  tax_rate: 0.2564,
};

const referenceFunding = [
  { type: 'sba_7a', amount: 612_152, rate: 0.115, term_years: 10 },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.setResponses({ calc_version: calcVersionRow() });
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(
    GENERATED_ID as ReturnType<typeof crypto.randomUUID>,
  );
});

describe('createCalcVersion', () => {
  it('inserts a calc_version scoped to the deal account and returns its id', async () => {
    mocks.setResponses({ deal: { account_id: 'account-7' } });

    const result = await (createCalcVersion as unknown as Action)(
      { deal_id: 'deal-1', type: 'sde', name: 'Base case' },
      user,
    );

    const [table, payload] = mocks.insertSpy.mock.calls.at(-1) as unknown as [
      string,
      Record<string, unknown>,
    ];

    expect(table).toBe('calc_version');
    expect(payload).toMatchObject({
      account_id: 'account-7',
      deal_id: 'deal-1',
      type: 'sde',
      name: 'Base case',
    });
    expect(result).toBe(GENERATED_ID);
  });
});

describe('saveSdeCalc', () => {
  it('replaces periods and lines and snapshots the weighted SDE from @odb/calculators', async () => {
    await (saveSdeCalc as unknown as Action)(
      { calc_version_id: 'calc_version-1', periods: referenceSdePeriods },
      user,
    );

    expect(mocks.deleteSpy).toHaveBeenCalledWith('sde_period');
    expect(
      mocks.insertSpy.mock.calls.some(([table]) => table === 'sde_period'),
    ).toBe(true);
    expect(
      mocks.insertSpy.mock.calls.some(([table]) => table === 'sde_line'),
    ).toBe(true);

    const [, snapshotPayload] = mocks.updateSpy.mock.calls.at(
      -1,
    ) as unknown as [string, { outputs_snapshot: Record<string, unknown> }];

    expect(snapshotPayload.outputs_snapshot.weighted_sde).toBe(507_676);
    const periods = snapshotPayload.outputs_snapshot.periods as Array<
      Record<string, unknown>
    >;
    expect(periods).toHaveLength(3);
    expect(periods[2]?.annualized_sde).toBe(678_364);
  });

  it('rejects periods whose weights do not sum to one', async () => {
    const offWeights = [
      { weight: 0.2, lines: [{ line_code: 'sales', amount: 0 }] },
      { weight: 0.3, lines: [{ line_code: 'sales', amount: 561_646 }] },
      {
        weight: 0.4,
        months: 3,
        lines: [{ line_code: 'sales', amount: 169_591 }],
      },
    ];

    await expect(
      (saveSdeCalc as unknown as Action)(
        { calc_version_id: 'calc_version-1', periods: offWeights },
        user,
      ),
    ).rejects.toThrow();

    expect(mocks.updateSpy).not.toHaveBeenCalled();
  });
});

describe('saveDealCalc', () => {
  it('upserts the inputs, replaces funding, and snapshots DSCR 1.43x via @odb/calculators', async () => {
    await (saveDealCalc as unknown as Action)(
      {
        calc_version_id: 'calc_version-1',
        inputs: referenceDealInputs,
        funding_sources: referenceFunding,
        deal_box_id: 'box-1',
        imported_from_version_id: 'calc_version-9',
      },
      user,
    );

    const [upsertTable, upsertPayload] = mocks.upsertSpy.mock.calls.at(
      -1,
    ) as unknown as [string, Record<string, unknown>];
    expect(upsertTable).toBe('deal_calc_input');
    expect(upsertPayload).toMatchObject({
      calc_version_id: 'calc_version-1',
      deal_box_id: 'box-1',
      imported_from_version_id: 'calc_version-9',
    });

    expect(mocks.deleteSpy).toHaveBeenCalledWith('funding_source');
    expect(
      mocks.insertSpy.mock.calls.some(([table]) => table === 'funding_source'),
    ).toBe(true);

    const [, snapshotPayload] = mocks.updateSpy.mock.calls.at(
      -1,
    ) as unknown as [string, { outputs_snapshot: Record<string, unknown> }];
    const snapshot = snapshotPayload.outputs_snapshot;

    expect(snapshot.sde).toBe(163_000);
    expect(round2(snapshot.dscr as number)).toBe(1.43);
    expect(snapshot.net_cash_flow).toBeCloseTo(59_721, 0);
  });
});

describe('saveWorkingCapitalCalc', () => {
  it('stores the inputs and snapshots working capital via @odb/calculators', async () => {
    await (saveWorkingCapitalCalc as unknown as Action)(
      {
        calc_version_id: 'calc_version-1',
        current_assets: 300_000,
        current_liabilities: 120_000,
        avg_monthly_revenue: 60_000,
      },
      user,
    );

    const [upsertTable] = mocks.upsertSpy.mock.calls.at(-1) as unknown as [
      string,
    ];
    expect(upsertTable).toBe('deal_calc_input');

    const [, snapshotPayload] = mocks.updateSpy.mock.calls.at(
      -1,
    ) as unknown as [string, { outputs_snapshot: Record<string, unknown> }];

    expect(snapshotPayload.outputs_snapshot.working_capital).toBe(180_000);
    expect(snapshotPayload.outputs_snapshot.months_of_revenue_covered).toBe(3);
  });
});

describe('markPrimaryCalcVersion', () => {
  it('clears siblings of the same deal and type, then flags this version primary', async () => {
    await (markPrimaryCalcVersion as unknown as Action)(
      { calc_version_id: 'calc_version-1' },
      user,
    );

    const primaryFlags = mocks.updateSpy.mock.calls
      .filter(([table]) => table === 'calc_version')
      .map(([, payload]) => (payload as { is_primary: boolean }).is_primary);

    expect(primaryFlags).toEqual([false, true]);
  });
});

describe('duplicateCalcVersion', () => {
  it('copies the version and its children under a new name', async () => {
    mocks.setResponses({
      calc_version: calcVersionRow({ name: 'Base case' }),
      sde_period: [
        {
          id: 'period-1',
          label: 'Last year',
          weight: 1,
          months: null,
          sde_line: [{ line_code: 'sales', custom_label: null, amount: 561_646 }],
        },
      ],
      deal_calc_input: {
        inputs: { pl: {} },
        deal_box_id: null,
        imported_from_version_id: null,
      },
      funding_source: [{ type: 'sba_7a', amount: 612_152 }],
    });

    await (duplicateCalcVersion as unknown as Action)(
      { calc_version_id: 'calc_version-1' },
      user,
    );

    const insertedTables = mocks.insertSpy.mock.calls.map(([table]) => table);
    expect(insertedTables).toContain('calc_version');
    expect(insertedTables).toContain('sde_period');
    expect(insertedTables).toContain('sde_line');
    expect(insertedTables).toContain('deal_calc_input');
    expect(insertedTables).toContain('funding_source');

    const copy = mocks.insertSpy.mock.calls.find(
      ([table]) => table === 'calc_version',
    );
    expect((copy?.[1] as { name: string }).name).toBe('Copy of Base case');
  });
});

describe('deleteCalcVersion', () => {
  it('deletes the calc_version row', async () => {
    await (deleteCalcVersion as unknown as Action)(
      { calc_version_id: 'calc_version-1' },
      user,
    );

    expect(mocks.deleteSpy).toHaveBeenCalledWith('calc_version');
  });
});

describe('adoptCalcVersion', () => {
  it('promotes the snapshot figures through adoptDealFinancials', async () => {
    mocks.setResponses({
      calc_version: calcVersionRow({
        outputs_snapshot: {
          type: 'sde',
          weighted_sde: 507_676,
          adopt: { revenue: 920_000, sde: 507_676, ebitda: null },
        },
      }),
    });

    await (adoptCalcVersion as unknown as Action)(
      { deal_id: 'deal-1', calc_version_id: 'calc_version-1' },
      user,
    );

    expect(mocks.appendDealEvent).toHaveBeenCalledWith(expect.anything(), {
      dealId: 'deal-1',
      aggregateType: 'deal',
      aggregateId: 'deal-1',
      eventType: 'deal.financials_adopted',
      payload: {
        adopted_revenue: 920_000,
        adopted_sde: 507_676,
        adopted_ebitda: null,
        source_calc_version_id: 'calc_version-1',
      },
    });
  });
});
