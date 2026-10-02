'use server';

import { enhanceAction } from '@odb/next/actions';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { dealThesisSchema } from '../schema/deal-thesis.schema';

export const upsertDealThesis = enhanceAction(
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
      .from('deal_thesis')
      .upsert(
        { deal_id, account_id: deal.account_id, ...fields },
        { onConflict: 'deal_id' },
      )
      .select('*')
      .single()
      .throwOnError();

    return row;
  },
  { auth: true, schema: dealThesisSchema },
);
