'use server';

import { getSupabaseServerClient } from '@odb/supabase/server';

import { dealOperatingPeriodSchema } from '../schema/operating-period.schema';
import { refusableAction } from './refusal';

export const saveDealOperatingPeriod = refusableAction(
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
  dealOperatingPeriodSchema,
  {
    what: 'record operating results',
    needs: 'deals.manage',
    dealId: (data) => data.deal_id,
  },
);
