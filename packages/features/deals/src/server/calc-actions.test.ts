import { beforeEach, describe, expect, it, vi } from 'vitest';

const GENERATED_ID = '00000000-0000-0000-0000-000000000001';
const round2 = (value: number) => Number(value.toFixed(2));

const mocks = vi.hoisted(() => {
  const appendDealEvent = vi.fn(async () => [
    { deal_seq: 1, aggregate_seq: 1 },
  ]);
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
    builder.in = chain;
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
  enhanceAction:
    (fn: (data: unknown, user: { id: string }) => unknown) =>
    (data: unknown, user?: { id: string }) =>
      fn(data, user ?? { id: 'user-1' }),
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    from: mocks.from,
    rpc: () => ({ throwOnError: async () => ({ data: [] }) }),
  }),
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
    id: '4cabc7b9-2dfa-43b1-8665-b393543954c7',
    account_id: 'd189aa4d-3d82-46d6-8967-4a2079217dfb',
    deal_id: '6221ddef-b8e9-484f-8bb8-0967d8e16a30',
    type: 'sde',
    name: 'Base case',
    notes: null,
    is_primary: false,
    outputs_snapshot: {},
    ...overrides,
  };
}

const referenceSdePeriods = [
  {
    id: 'bbdaa1b8-7806-40f1-88e7-bf9490ec49e6',
    label: 'Two years ago',
    weight: 0.2,
    lines: [{ line_code: 'sales', amount: 0 }],
  },
  {
    id: '154c394c-7c6d-4f59-b3c7-cd1bef3531e3',
    label: 'Last year',
    weight: 0.3,
    lines: [{ line_code: 'sales', amount: 561_646 }],
  },
  {
    id: 'b03346d7-da54-45c6-895c-fad0ee28ac60',
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
  {
    id: '02964b30-c1e8-4370-aeea-360dae852551',
    type: 'sba_7a',
    amount: 612_152,
    rate: 0.115,
    term_years: 10,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.setResponses({
    calc_version: calcVersionRow(),
    sde_period: [],
    sde_line: [],
    funding_source: [],
  });
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(
    GENERATED_ID as ReturnType<typeof crypto.randomUUID>,
  );
});

describe('createCalcVersion', () => {
  it('inserts a calc_version scoped to the deal account and returns its id', async () => {
    mocks.setResponses({
      deal: { account_id: 'd46f647e-2a02-4474-8cdb-cff54ef45a44' },
    });

    const result = await (createCalcVersion as unknown as Action)(
      {
        deal_id: '6221ddef-b8e9-484f-8bb8-0967d8e16a30',
        type: 'sde',
        name: 'Base case',
      },
      user,
    );

    const [table, payload] = mocks.insertSpy.mock.calls.at(-1) as unknown as [
      string,
      Record<string, unknown>,
    ];

    expect(table).toBe('calc_version');
    expect(payload).toMatchObject({
      account_id: 'd46f647e-2a02-4474-8cdb-cff54ef45a44',
      deal_id: '6221ddef-b8e9-484f-8bb8-0967d8e16a30',
      type: 'sde',
      name: 'Base case',
    });
    expect(result).toEqual({ ok: true, value: GENERATED_ID });
  });
});

describe('saveSdeCalc', () => {
  it('replaces periods and lines and snapshots the weighted SDE from @odb/calculators', async () => {
    await (saveSdeCalc as unknown as Action)(
      {
        calc_version_id: '4cabc7b9-2dfa-43b1-8665-b393543954c7',
        periods: referenceSdePeriods,
      },
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

    const adopt = snapshotPayload.outputs_snapshot.adopt as Record<
      string,
      unknown
    >;
    expect(adopt.ebitda).toBe(678_364);
  });

  it('rejects periods whose weights do not sum to one', async () => {
    const offWeights = [
      {
        id: '6a1b5dbb-798f-416c-a5e7-26599891fec1',
        weight: 0.2,
        lines: [{ line_code: 'sales', amount: 0 }],
      },
      {
        id: '863f01b4-e555-44e4-89c3-a559e80261e9',
        weight: 0.3,
        lines: [{ line_code: 'sales', amount: 561_646 }],
      },
      {
        id: 'b26bcab3-6bfa-45de-9297-f33b1b97357b',
        weight: 0.4,
        months: 3,
        lines: [{ line_code: 'sales', amount: 169_591 }],
      },
    ];

    await expect(
      (saveSdeCalc as unknown as Action)(
        {
          calc_version_id: '4cabc7b9-2dfa-43b1-8665-b393543954c7',
          periods: offWeights,
        },
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
        calc_version_id: '4cabc7b9-2dfa-43b1-8665-b393543954c7',
        inputs: referenceDealInputs,
        funding_sources: referenceFunding,
        deal_box_id: '0f1e7d71-489d-42c2-8768-ab484468ad8f',
        imported_from_version_id: '5719a0ee-471d-4ed2-8129-9c3bffd0e69b',
      },
      user,
    );

    const [upsertTable, upsertPayload] = mocks.upsertSpy.mock.calls.find(
      ([table]) => table === 'deal_calc_input',
    ) as unknown as [string, Record<string, unknown>];
    expect(upsertTable).toBe('deal_calc_input');
    expect(upsertPayload).toMatchObject({
      calc_version_id: '4cabc7b9-2dfa-43b1-8665-b393543954c7',
      deal_box_id: '0f1e7d71-489d-42c2-8768-ab484468ad8f',
      imported_from_version_id: '5719a0ee-471d-4ed2-8129-9c3bffd0e69b',
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

    const adopt = snapshot.adopt as Record<string, unknown>;
    expect(adopt.ebitda).toBe(163_000);
  });

  it('snapshots years 1 to 3 per source, with grown SDE, and offers them for adoption', async () => {
    await (saveDealCalc as unknown as Action)(
      {
        calc_version_id: '4cabc7b9-2dfa-43b1-8665-b393543954c7',
        inputs: {
          ...referenceDealInputs,
          pl: { ...referenceDealInputs.pl, sales: 100_000 },
          annual_growth: 0.1,
          tax_rate: 0,
        },
        funding_sources: [
          {
            id: '9c15a95e-0d6c-4a93-914a-038edc3ed2fe',
            type: 'sba_7a',
            amount: 360_000,
            rate: 0,
            term_years: 10,
          },
          {
            id: 'c9181735-1f7f-4c29-846d-cb07123f452c',
            type: 'seller_financing',
            amount: 120_000,
            rate: 0,
            term_years: 5,
            standby_months: 18,
            after_standby: 'remaining_term',
          },
        ],
      },
      user,
    );

    const fundingRows = mocks.insertSpy.mock.calls.find(
      ([table]) => table === 'funding_source',
    )?.[1] as Array<{ after_standby: string | null }>;
    expect(fundingRows.map((row) => row.after_standby)).toEqual([
      null,
      'remaining_term',
    ]);

    const [, snapshotPayload] = mocks.updateSpy.mock.calls.at(
      -1,
    ) as unknown as [string, { outputs_snapshot: Record<string, unknown> }];
    const years = snapshotPayload.outputs_snapshot.years as Array<{
      debt_service_by_source: number[];
      debt_service: number;
      dscr: number;
      net_cash_flow: number;
    }>;

    expect(years[0]!.debt_service_by_source).toEqual([36_000, 0]);
    expect(years[1]!.debt_service_by_source[1]).toBeCloseTo(17_142.857, 2);
    expect(years[2]!.debt_service).toBeCloseTo(70_285.714, 2);
    expect(years[2]!.dscr).toBeCloseTo(1.72154, 4);
    expect(years[1]!.net_cash_flow).toBeCloseTo(56_857.143, 2);
    const proForma = snapshotPayload.outputs_snapshot.pro_forma as number[];
    expect(proForma).toHaveLength(10);
    expect(proForma[1]).toBeCloseTo(56_857.143, 2);

    const adopt = snapshotPayload.outputs_snapshot.adopt as {
      years: Array<Record<string, number>>;
    };
    expect(adopt.years).toHaveLength(3);
    expect(adopt.years[2]).toEqual({
      year: 3,
      debt_service: years[2]!.debt_service,
      dscr: years[2]!.dscr,
      net_cash_flow: years[2]!.net_cash_flow,
    });
  });
});

describe('saveDealCalc on fiscal years', () => {
  it('snapshots debt service per fiscal year from the close date and fiscal year end', async () => {
    await (saveDealCalc as unknown as Action)(
      {
        calc_version_id: '4cabc7b9-2dfa-43b1-8665-b393543954c7',
        inputs: {
          ...referenceDealInputs,
          year_basis: {
            kind: 'fiscal_year',
            close_date: '2026-03-15',
            fiscal_year_end_month: 12,
          },
        },
        funding_sources: [
          {
            id: 'b8ac87e5-ea11-4685-af72-351b4a26ecfc',
            type: 'sba_7a',
            amount: 360_000,
            rate: 0,
            term_years: 10,
          },
        ],
      },
      user,
    );

    const [, snapshotPayload] = mocks.updateSpy.mock.calls.at(
      -1,
    ) as unknown as [string, { outputs_snapshot: Record<string, unknown> }];
    const years = snapshotPayload.outputs_snapshot.years as Array<{
      debt_service: number;
    }>;
    expect(years.map((year) => year.debt_service)).toEqual([
      27_000, 36_000, 36_000,
    ]);
  });
});

describe('saveDealCalc scenario paths', () => {
  const pathInputs = {
    ...referenceDealInputs,
    pl: { ...referenceDealInputs.pl, sales: 400_000, opex: 300_000 },
    tax_rate: 0,
    reference_line: 1.25,
  };
  const pathFunding = [
    {
      id: '598fdba5-bddf-4799-842a-1ade32309596',
      type: 'sba_7a',
      amount: 360_000,
      rate: 0.06,
      term_years: 10,
    },
  ];

  async function snapshotFor(inputs: Record<string, unknown>) {
    await (saveDealCalc as unknown as Action)(
      {
        calc_version_id: '4cabc7b9-2dfa-43b1-8665-b393543954c7',
        inputs,
        funding_sources: pathFunding,
      },
      user,
    );
    const [, payload] = mocks.updateSpy.mock.calls.at(-1) as unknown as [
      string,
      { outputs_snapshot: Record<string, unknown> },
    ];
    return payload.outputs_snapshot;
  }

  it('snapshots worst, good and great for 10 years against the minimum DSCR', async () => {
    const snapshot = await snapshotFor({
      ...pathInputs,
      scenario_paths: {
        worst: {
          revenue_loss: 0.1,
          growth: 0,
          margin_change: -0.02,
          rate_shift: 0.02,
        },
        great: {
          revenue_loss: 0,
          growth: 0.05,
          margin_change: 0.02,
          rate_shift: -0.01,
        },
      },
    });
    const result = snapshot.scenario_paths as {
      status: string;
      paths: Record<
        'worst' | 'good' | 'great',
        Array<{ sde: number; below_minimum: boolean }>
      >;
    };

    expect(result.status).toBe('ready');
    expect(result.paths.worst).toHaveLength(10);
    expect(result.paths.worst[0]!.sde).toBeCloseTo(52_800, 6);
    expect(result.paths.worst[0]!.below_minimum).toBe(true);
    expect(result.paths.good[0]!.sde).toBe(100_000);
    expect(result.paths.great[0]!.sde).toBeCloseTo(108_000, 6);
  });

  it('flags against 1.25 when the inputs carry no minimum DSCR', async () => {
    const { reference_line: _omitted, ...withoutMinimum } = pathInputs;
    const snapshot = await snapshotFor({
      ...withoutMinimum,
      scenario_paths: {
        worst: { revenue_loss: 0, growth: 0, margin_change: 0, rate_shift: 0 },
        great: { revenue_loss: 0, growth: 0, margin_change: 0, rate_shift: 0 },
      },
      pl: { ...pathInputs.pl, opex: 340_060 },
    });
    const result = snapshot.scenario_paths as {
      paths: { good: Array<{ dscr: number; below_minimum: boolean }> };
    };

    expect(result.paths.good[0]!.dscr).toBeCloseTo(59_940 / 47_960.86, 6);
    expect(result.paths.good[0]!.below_minimum).toBe(true);
  });

  it('snapshots no paths for inputs saved without path drivers', async () => {
    expect((await snapshotFor(pathInputs)).scenario_paths).toBeNull();
  });
});

describe('saveWorkingCapitalCalc', () => {
  it('stores the inputs and snapshots working capital via @odb/calculators', async () => {
    await (saveWorkingCapitalCalc as unknown as Action)(
      {
        calc_version_id: '4cabc7b9-2dfa-43b1-8665-b393543954c7',
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
      { calc_version_id: '4cabc7b9-2dfa-43b1-8665-b393543954c7' },
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
          sde_line: [
            {
              id: 'line-1',
              line_code: 'sales',
              custom_label: null,
              amount: 561_646,
            },
          ],
        },
      ],
      deal_calc_input: {
        inputs: { pl: {} },
        deal_box_id: null,
        imported_from_version_id: null,
      },
      calc_input_citation: [],
      funding_source: [
        {
          id: 'c00a6b85-c7aa-4e9b-8bd3-8621c784e07c',
          type: 'sba_7a',
          amount: 612_152,
          after_standby: 'remaining_term',
        },
      ],
    });

    await (duplicateCalcVersion as unknown as Action)(
      { calc_version_id: '4cabc7b9-2dfa-43b1-8665-b393543954c7' },
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

    const fundingCopy = mocks.insertSpy.mock.calls.find(
      ([table]) => table === 'funding_source',
    )?.[1] as Array<{ after_standby: string }>;
    expect(fundingCopy[0]!.after_standby).toBe('remaining_term');
  });
});

describe('deleteCalcVersion', () => {
  it('deletes the calc_version row', async () => {
    await (deleteCalcVersion as unknown as Action)(
      { calc_version_id: '4cabc7b9-2dfa-43b1-8665-b393543954c7' },
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
      {
        deal_id: '6221ddef-b8e9-484f-8bb8-0967d8e16a30',
        calc_version_id: '4cabc7b9-2dfa-43b1-8665-b393543954c7',
      },
      user,
    );

    expect(mocks.appendDealEvent).toHaveBeenCalledWith(expect.anything(), {
      dealId: '6221ddef-b8e9-484f-8bb8-0967d8e16a30',
      aggregateType: 'deal',
      aggregateId: '6221ddef-b8e9-484f-8bb8-0967d8e16a30',
      eventType: 'deal.financials_adopted',
      payload: {
        adopted_revenue: 920_000,
        adopted_sde: 507_676,
        adopted_ebitda: null,
        adopted_years: null,
        source_calc_version_id: '4cabc7b9-2dfa-43b1-8665-b393543954c7',
      },
    });
  });

  it('returns the refusal when the caller cannot adopt financials', async () => {
    mocks.setResponses({
      calc_version: calcVersionRow({
        outputs_snapshot: {
          type: 'deal',
          adopt: { revenue: 920_000, sde: 507_676, ebitda: 245_000 },
        },
      }),
    });
    mocks.appendDealEvent.mockRejectedValueOnce({
      code: '42501',
      message:
        'not authorized to append deal.financials_adopted on deal: needs deals.manage',
    });

    expect(
      await (adoptCalcVersion as unknown as Action)(
        {
          deal_id: '6221ddef-b8e9-484f-8bb8-0967d8e16a30',
          calc_version_id: '4cabc7b9-2dfa-43b1-8665-b393543954c7',
        },
        user,
      ),
    ).toEqual({
      ok: false,
      refusal: 'Only deal managers can adopt financials. Ask a deal manager.',
    });
  });

  it('forwards a snapshot EBITDA as adopted_ebitda', async () => {
    mocks.setResponses({
      calc_version: calcVersionRow({
        outputs_snapshot: {
          type: 'deal',
          adopt: { revenue: 920_000, sde: 507_676, ebitda: 245_000 },
        },
      }),
    });

    await (adoptCalcVersion as unknown as Action)(
      {
        deal_id: '6221ddef-b8e9-484f-8bb8-0967d8e16a30',
        calc_version_id: '4cabc7b9-2dfa-43b1-8665-b393543954c7',
      },
      user,
    );

    const [, payload] = mocks.appendDealEvent.mock.calls.at(-1) as unknown as [
      unknown,
      { payload: { adopted_ebitda: number } },
    ];
    expect(payload.payload.adopted_ebitda).toBe(245_000);
  });

  it('refuses to adopt snapshot years that are not year figures', async () => {
    mocks.setResponses({
      calc_version: calcVersionRow({
        outputs_snapshot: {
          type: 'deal',
          adopt: { revenue: 1, sde: 1, ebitda: 1, years: [{ year: 1 }] },
        },
      }),
    });

    await expect(
      (adoptCalcVersion as unknown as Action)(
        {
          deal_id: '6221ddef-b8e9-484f-8bb8-0967d8e16a30',
          calc_version_id: '4cabc7b9-2dfa-43b1-8665-b393543954c7',
        },
        user,
      ),
    ).rejects.toThrow();
    expect(mocks.appendDealEvent).not.toHaveBeenCalled();
  });

  it('forwards the snapshot years 1 to 3 as adopted_years', async () => {
    const years = [
      { year: 1, debt_service: 36_000, dscr: 2.5, net_cash_flow: 54_000 },
      { year: 2, debt_service: 36_000, dscr: 2.75, net_cash_flow: 63_000 },
      { year: 3, debt_service: 0, dscr: null, net_cash_flow: 99_000 },
    ];
    mocks.setResponses({
      calc_version: calcVersionRow({
        outputs_snapshot: {
          type: 'deal',
          adopt: { revenue: 920_000, sde: 90_000, ebitda: 80_000, years },
        },
      }),
    });

    await (adoptCalcVersion as unknown as Action)(
      {
        deal_id: '6221ddef-b8e9-484f-8bb8-0967d8e16a30',
        calc_version_id: '4cabc7b9-2dfa-43b1-8665-b393543954c7',
      },
      user,
    );

    const [, payload] = mocks.appendDealEvent.mock.calls.at(-1) as unknown as [
      unknown,
      { payload: { adopted_years: unknown } },
    ];
    expect(payload.payload.adopted_years).toEqual(years);
  });
});
