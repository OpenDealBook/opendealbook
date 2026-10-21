import {
  type DscrOptions,
  type PathDrivers,
  type ProjectedYear,
  type ScenarioPathDrivers,
  type YearBasis,
  projectYear,
  shiftRates,
} from './deal-calc';
import type { FundingSource } from './funding-source';

export const NO_REVENUE_FOR_PATHS = 'Add revenue to see scenario paths.';

export const STARTER_SCENARIO_PATHS: ScenarioPathDrivers = {
  worst: { revenue_loss: 0.1, growth: 0, margin_change: -0.02, rate_shift: 0.02 },
  great: { revenue_loss: 0, growth: 0.05, margin_change: 0.02, rate_shift: -0.01 },
};

export interface PathYear extends ProjectedYear {
  revenue: number;
  below_minimum: boolean;
}

export interface ScenarioPathsInputs {
  sales: number;
  sde: number;
  annualGrowth: number;
  sources: FundingSource[];
  dscrOptions: DscrOptions;
  basis: YearBasis;
  minimumDscr: number;
  drivers: ScenarioPathDrivers;
}

export type ScenarioPathsResult =
  | { status: 'refused'; message: string }
  | {
      status: 'ready';
      paths: { worst: PathYear[]; good: PathYear[]; great: PathYear[] };
    };

function path(inputs: ScenarioPathsInputs, drivers: PathDrivers): PathYear[] {
  const yearOneRevenue = inputs.sales * (1 - drivers.revenue_loss);
  const yearOneSde =
    inputs.sde -
    inputs.sales * drivers.revenue_loss +
    drivers.margin_change * yearOneRevenue;
  const projection = {
    sde: yearOneSde,
    annualGrowth: drivers.growth,
    sources: shiftRates(inputs.sources, drivers.rate_shift),
    dscrOptions: inputs.dscrOptions,
    basis: inputs.basis,
  };
  return Array.from({ length: 10 }, (_, index) => {
    const year = projectYear(projection, index + 1);
    return {
      ...year,
      revenue: yearOneRevenue * Math.pow(1 + drivers.growth, index),
      below_minimum: year.dscr != null && year.dscr < inputs.minimumDscr,
    };
  });
}

export function scenarioPaths(
  inputs: ScenarioPathsInputs,
): ScenarioPathsResult {
  if (inputs.sales <= 0) {
    return { status: 'refused', message: NO_REVENUE_FOR_PATHS };
  }
  return {
    status: 'ready',
    paths: {
      worst: path(inputs, inputs.drivers.worst),
      good: path(inputs, {
        revenue_loss: 0,
        growth: inputs.annualGrowth,
        margin_change: 0,
        rate_shift: 0,
      }),
      great: path(inputs, inputs.drivers.great),
    },
  };
}
