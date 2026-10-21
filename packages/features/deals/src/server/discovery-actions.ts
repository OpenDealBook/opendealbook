'use server';

import { getSupabaseServerClient } from '@odb/supabase/server';

import { dealDiscoverySchema } from '../schema/deal-discovery.schema';
import { refusableAction } from './refusal';

export const saveDealDiscovery = refusableAction(
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
      .from('deal_discovery')
      .upsert(
        { deal_id, account_id: deal.account_id, ...fields },
        { onConflict: 'deal_id' },
      )
      .select('*')
      .single()
      .throwOnError();

    return row;
  },
  dealDiscoverySchema,
  {
    what: 'edit discovery notes',
    needs: 'deals.manage',
    dealId: (data) => data.deal_id,
  },
);
