import { describe, expect, it } from 'vitest';

import {
  type ScenarioPathDrivers,
  tenYearProForma,
  threeYearProjection,
} from './deal-calc';
import type { FundingSource } from './funding-source';
import {
  NO_REVENUE_FOR_PATHS,
  STARTER_SCENARIO_PATHS,
  scenarioPaths,
} from './scenario-paths';

const loan: FundingSource = {
  type: 'sba_7a',
  amount: 360_000,
  rate: 0.06,
  term_years: 10,
};

const base = {
  sales: 400_000,
  sde: 100_000,
  annualGrowth: 0,
  sources: [loan, { type: 'cash_equity', amount: 50_000 } as FundingSource],
  dscrOptions: { mode: 'tax_adjusted' as const, taxRate: 0 },
  basis: { kind: 'months_from_close' as const },
  minimumDscr: 1.25,
};

const drivers: ScenarioPathDrivers = STARTER_SCENARIO_PATHS;

function ready(result: ReturnType<typeof scenarioPaths>) {
  if (result.status !== 'ready') {
    throw new Error(result.message);
  }
  return result.paths;
}

describe('scenarioPaths', () => {
  it('takes lost revenue straight off SDE, then applies the margin change in points', () => {
    const worst = ready(scenarioPaths({ ...base, drivers })).worst;

    expect(worst[0]!.revenue).toBe(360_000);
    expect(worst[0]!.sde).toBeCloseTo(52_800, 6);
    expect(worst[9]!.sde).toBeCloseTo(52_800, 6);
  });

  it("shifts every loan's own rate by the path's rate shift", () => {
    const worst = ready(scenarioPaths({ ...base, drivers })).worst;

    expect(worst[0]!.debt_service).toBeCloseTo(52_413.52, 2);
    expect(worst[0]!.net_cash_flow).toBeCloseTo(386.48, 2);
    expect(worst[0]!.dscr).toBeCloseTo(1.0074, 4);
  });

  it('grows revenue and SDE at the path growth rate', () => {
    const great = ready(scenarioPaths({ ...base, drivers })).great;

    expect(great[0]!.sde).toBeCloseTo(108_000, 6);
    expect(great[2]!.revenue).toBeCloseTo(441_000, 6);
    expect(great[2]!.sde).toBeCloseTo(119_070, 6);
    expect(great[2]!.net_cash_flow).toBeCloseTo(73_249.7, 1);
  });

  it('runs the good path on the calc inputs, matching the 3-year table and pro forma', () => {
    const projection = {
      sde: base.sde,
      annualGrowth: 0.03,
      sources: base.sources,
      dscrOptions: base.dscrOptions,
      basis: base.basis,
    };
    const good = ready(
      scenarioPaths({ ...base, annualGrowth: 0.03, drivers }),
    ).good;

    expect(good).toHaveLength(10);
    expect(good.slice(0, 3).map((year) => year.dscr)).toEqual(
      threeYearProjection(projection).map((year) => year.dscr),
    );
    expect(good.map((year) => year.net_cash_flow)).toEqual(
      tenYearProForma(projection),
    );
    expect(good[1]!.revenue).toBeCloseTo(412_000, 6);
  });

  it('flags years below the minimum DSCR, passes equal, and never flags years without debt service', () => {
    const paths = ready(
      scenarioPaths({
        ...base,
        sources: [
          { type: 'seller_financing', amount: 120_000, rate: 0, term_years: 1 },
        ],
        sde: 150_000,
        minimumDscr: 1.25,
        drivers: {
          worst: { revenue_loss: 0, growth: 0, margin_change: 0, rate_shift: 0 },
          great: { revenue_loss: 0, growth: 0, margin_change: 0, rate_shift: 0 },
        },
      }),
    );

    expect(paths.good[0]!.dscr).toBe(1.25);
    expect(paths.good[0]!.below_minimum).toBe(false);
    expect(paths.good[1]!.dscr).toBeNull();
    expect(paths.good[1]!.below_minimum).toBe(false);

    const tight = ready(scenarioPaths({ ...base, drivers })).worst;
    expect(tight[0]!.below_minimum).toBe(true);
  });

  it('refuses paths when revenue is negative', () => {
    expect(scenarioPaths({ ...base, sales: -1, drivers })).toEqual({
      status: 'refused',
      message: NO_REVENUE_FOR_PATHS,
    });
  });

  it('never shifts a loan rate below 0%', () => {
    const great = ready(
      scenarioPaths({
        ...base,
        sources: [{ ...loan, rate: 0.005 }],
        drivers: {
          ...drivers,
          great: { revenue_loss: 0, growth: 0, margin_change: 0, rate_shift: -0.01 },
        },
      }),
    ).great;
    expect(great[0]!.debt_service).toBe(36_000);
  });

  it('refuses paths when the calc has no revenue', () => {
    expect(scenarioPaths({ ...base, sales: 0, drivers })).toEqual({
      status: 'refused',
      message: NO_REVENUE_FOR_PATHS,
    });
    expect(NO_REVENUE_FOR_PATHS).toBe('Add revenue to see scenario paths.');
  });
});

describe('STARTER_SCENARIO_PATHS', () => {
  it('holds the ruled starters', () => {
    expect(STARTER_SCENARIO_PATHS).toEqual({
      worst: { revenue_loss: 0.1, growth: 0, margin_change: -0.02, rate_shift: 0.02 },
      great: { revenue_loss: 0, growth: 0.05, margin_change: 0.02, rate_shift: -0.01 },
    });
  });
});

describe('revenue lost bounds message', () => {
  it('explains the 0 to 100% range', async () => {
    const { scenarioPathDriversSchema } = await import('./deal-calc');
    const result = scenarioPathDriversSchema.safeParse({
      worst: { ...STARTER_SCENARIO_PATHS.worst, revenue_loss: 1.2 },
      great: STARTER_SCENARIO_PATHS.great,
    });
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      'Revenue lost at close must be between 0% and 100%.',
    ]);
  });
});
