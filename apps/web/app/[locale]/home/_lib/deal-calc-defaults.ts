import {
  type AfterStandby,
  type ScenarioPathDrivers,
  type YearBasis,
  STARTER_SCENARIO_PATHS,
  afterStandbySchema,
  scenarioPathDriversSchema,
  yearBasisKindSchema,
} from '@odb/calculators';
import type { getSupabaseServerClient } from '@odb/supabase/server';

export interface DealCalcDefaults {
  afterStandby: AfterStandby;
  yearBasis: YearBasis['kind'];
  scenarioPaths: ScenarioPathDrivers;
  minimumDscr: number;
}

export function parseDealCalcDefaults(
  row: {
    after_standby: string;
    year_basis: string;
    scenario_paths: unknown;
    minimum_dscr: number;
  } | null,
): DealCalcDefaults {
  if (row === null) {
    return {
      afterStandby: 'full_term_after_standby',
      yearBasis: 'months_from_close',
      scenarioPaths: STARTER_SCENARIO_PATHS,
      minimumDscr: 1.25,
    };
  }
  return {
    afterStandby: afterStandbySchema.parse(row.after_standby),
    yearBasis: yearBasisKindSchema.parse(row.year_basis),
    scenarioPaths:
      row.scenario_paths === null
        ? STARTER_SCENARIO_PATHS
        : scenarioPathDriversSchema.parse(row.scenario_paths),
    minimumDscr: row.minimum_dscr,
  };
}

export async function loadDealCalcDefaults(
  client: ReturnType<typeof getSupabaseServerClient>,
  accountId: string,
): Promise<DealCalcDefaults> {
  const { data } = await client
    .from('deal_calc_defaults')
    .select('after_standby, year_basis, scenario_paths, minimum_dscr')
    .eq('account_id', accountId)
    .maybeSingle()
    .throwOnError();
  return parseDealCalcDefaults(data);
}
