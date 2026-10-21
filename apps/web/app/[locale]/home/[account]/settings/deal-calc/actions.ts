'use server';

import { z } from 'zod';

import {
  afterStandbySchema,
  scenarioPathDriversSchema,
  yearBasisKindSchema,
} from '@odb/calculators';
import { enhanceAction } from '@odb/next/actions';
import { getSupabaseServerClient } from '@odb/supabase/server';

const saveSchema = z.object({
  accountId: z.uuid(),
  after_standby: afterStandbySchema,
  year_basis: yearBasisKindSchema,
  scenario_paths: scenarioPathDriversSchema,
  minimum_dscr: z.number().positive(),
});

export const saveDealCalcDefaultsAction = enhanceAction(
  async (input) => {
    await getSupabaseServerClient()
      .from('deal_calc_defaults')
      .upsert({
        account_id: input.accountId,
        after_standby: input.after_standby,
        year_basis: input.year_basis,
        scenario_paths: input.scenario_paths,
        minimum_dscr: input.minimum_dscr,
      })
      .throwOnError();
  },
  { auth: true, schema: saveSchema },
);
