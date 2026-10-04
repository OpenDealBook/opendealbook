'use server';

import { enhanceAction } from '@odb/next/actions';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { dealValueMarkerSchema } from '../schema/deal-value-marker.schema';

export const saveDealValueMarkers = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    const { deal_id, markers } = data;

    const { data: deal } = await client
      .from('deal')
      .select('account_id')
      .eq('id', deal_id)
      .single()
      .throwOnError();

    const rows = markers.map((marker) => ({
      deal_id,
      account_id: deal.account_id,
      ...marker,
    }));

    const { data: saved } = await client
      .from('deal_value_marker')
      .upsert(rows, { onConflict: 'deal_id,question_key' })
      .select('*')
      .throwOnError();

    return saved;
  },
  { auth: true, schema: dealValueMarkerSchema },
);
