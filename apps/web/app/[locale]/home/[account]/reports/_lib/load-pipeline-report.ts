import { listDealsFaceted } from '@odb/deals';
import type { getSupabaseServerClient } from '@odb/supabase/server';

import { type PipelineReport, buildPipelineReport } from './pipeline-report';

type Client = ReturnType<typeof getSupabaseServerClient>;

interface StageEventRow {
  deal_id: string;
  event_type: string;
  payload: { stage?: string };
}

interface PipelineStageRow {
  key: string;
  label: string;
}

export async function loadPipelineReport(
  client: Client,
  accountId: string,
): Promise<PipelineReport> {
  const faceted = await listDealsFaceted(client, {
    accountId,
    filters: { archived: true },
    limit: 100,
  });

  const stageRows = await client
    .from('pipeline_stage')
    .select('key, label, sort_order')
    .eq('account_id', accountId)
    .order('sort_order');

  const eventRows = await client
    .from('deal_event')
    .select('deal_id, event_type, payload')
    .eq('account_id', accountId)
    .in('event_type', ['deal.created', 'deal.stage_changed']);

  const reach = new Map<string, Set<string>>();

  for (const row of eventRows.data as unknown as StageEventRow[]) {
    const stage =
      row.event_type === 'deal.created'
        ? row.payload.stage ?? 'sourcing'
        : row.payload.stage!;
    const reached = reach.get(row.deal_id) ?? new Set<string>();
    reached.add(stage);
    reach.set(row.deal_id, reached);
  }

  return buildPipelineReport({
    groupFacets: faceted.facetCounts.group,
    stageFacets: faceted.facetCounts.stage,
    resolutionFacets: faceted.facetCounts.resolution,
    reach,
    stages: (stageRows.data as unknown as PipelineStageRow[]).map((row) => ({
      key: row.key,
      label: row.label,
    })),
  });
}
