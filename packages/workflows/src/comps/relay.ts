import type { RelayEvent } from '@odb/comps';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

export interface FetchDealEventsInput {
  afterGlobalSeq: number;
  limit: number;
}

export async function fetchDealEventsSince(
  input: FetchDealEventsInput,
): Promise<RelayEvent[]> {
  const client = getSupabaseServerAdminClient();

  const { data, error } = await client
    .from('deal_event')
    .select('global_seq, deal_id, deal_seq, aggregate_type, event_type, payload')
    .gt('global_seq', input.afterGlobalSeq)
    .order('global_seq', { ascending: true })
    .limit(input.limit);

  if (error) {
    throw error;
  }

  return data.map((row) => ({
    globalSeq: row.global_seq,
    dealId: row.deal_id,
    dealSeq: row.deal_seq,
    aggregateType: row.aggregate_type,
    eventType: row.event_type,
    resolution: (row.payload as { resolution?: string } | null)?.resolution ?? null,
  }));
}
