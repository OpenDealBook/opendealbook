import { describe, expect, it } from 'vitest';

import type { DealFacetedRow } from '@odb/deals';

import { loadPipelineReport } from './load-pipeline-report';

function dealRow(id: string, firmName: string): DealFacetedRow {
  return {
    id,
    description: `${firmName} deal`,
    stage: 'nda',
    resolution: null,
    resolution_reason: null,
    listing_status: 'active',
    asking_price: null,
    revenue_ttm: null,
    sde_ttm: null,
    owner_user_id: null,
    archived_at: null,
    stage_changed_at: null,
    created_at: null,
    updated_at: null,
    capture_method: null,
    pipeline_stage: { key: 'nda', label: 'NDA', sort_order: 2 },
    deal_profile: null,
    deal_financials: null,
    deal_star: [],
    offer: [],
    firm: { name: firmName },
    deal_milestone: [],
    checklist_item: [],
    deal_event: [{ created_at: '2026-10-01T00:00:00Z' }],
  };
}

const tables: Record<string, unknown[]> = {
  deal: [dealRow('real', 'Brennan Climate Services'), dealRow('sample', '[Example] Coastal HVAC')],
  pipeline_stage: [
    { key: 'sourcing', label: 'Sourcing', sort_order: 1 },
    { key: 'nda', label: 'NDA', sort_order: 2 },
  ],
  deal_event: ['real', 'sample'].flatMap((dealId) => [
    { deal_id: dealId, event_type: 'deal.created', payload: { stage: 'sourcing' } },
    { deal_id: dealId, event_type: 'deal.stage_changed', payload: { stage: 'nda' } },
  ]),
};

function fakeClient() {
  const query = (table: string) => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      order: () => builder,
      limit: () => builder,
      then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
        resolve({ data: tables[table]!, error: null }),
    };
    return builder;
  };
  return {
    from: query,
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  };
}

describe('loadPipelineReport', () => {
  it('leaves example deals out of counts and stage reach', async () => {
    const report = await loadPipelineReport(fakeClient() as never, 'acct-1');

    expect(report.activeTotal).toBe(1);
    expect(report.stageDistribution.find((stage) => stage.key === 'nda')?.count).toBe(1);
    expect(report.funnel.map((step) => [step.key, step.reached])).toEqual([
      ['sourcing', 1],
      ['nda', 1],
    ]);
  });
});
