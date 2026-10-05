'use server';

import { enhanceAction } from '@odb/next/actions';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { dealOperatingPeriodSchema } from '../schema/operating-period.schema';

export const saveDealOperatingPeriod = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    const { deal_id, ...fields } = data;

    const { data: deal } = await client
      .from('deal')
      .select('account_id')
      .eq('id', deal_id)
      .single()
      .throwOnError();

    const { data: row } = await client
      .from('deal_operating_period')
      .upsert(
        { deal_id, account_id: deal.account_id, ...fields },
        { onConflict: 'deal_id,period_month' },
      )
      .select('*')
      .single()
      .throwOnError();

    return row;
  },
  { auth: true, schema: dealOperatingPeriodSchema },
);
