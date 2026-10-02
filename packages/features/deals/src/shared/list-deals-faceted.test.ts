import { describe, expect, it, vi } from 'vitest';

import {
  buildDealListResult,
  listDealsFaceted,
  mapDealRow,
  type DealFacetedRow,
} from './list-deals-faceted';

const NOW = '2026-10-02T00:00:00.000Z';
const USER = 'user-1';

function makeRow(overrides: Partial<DealFacetedRow> = {}): DealFacetedRow {
  return {
    id: 'd',
    description: 'A CPA firm',
    stage: 'sourcing',
    resolution: null,
    resolution_reason: null,
    listing_status: 'active',
    asking_price: 100_000,
    revenue_ttm: 500_000,
    sde_ttm: 150_000,
    owner_user_id: USER,
    archived_at: null,
    stage_changed_at: '2026-09-22T00:00:00.000Z',
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-20T00:00:00.000Z',
    capture_method: 'manual',
    pipeline_stage: { key: 'sourcing', label: 'Sourcing', sort_order: 1 },
    deal_profile: {
      industry_id: 'ind-1',
      location_id: 'loc-1',
      industry: { name: 'Accounting' },
      location: { name: 'Austin' },
    },
    deal_financials: null,
    deal_star: [],
    ...overrides,
  };
}

function candidates() {
  const rows: DealFacetedRow[] = [
    makeRow({ id: 'd1', stage: 'sourcing', asking_price: 100_000, revenue_ttm: 500_000, sde_ttm: 150_000, deal_star: [{ user_id: USER }] }),
    makeRow({ id: 'd2', stage: 'nda_signed', asking_price: 200_000, revenue_ttm: 800_000, sde_ttm: 200_000, pipeline_stage: { key: 'nda_signed', label: 'NDA Signed', sort_order: 3 } }),
    makeRow({ id: 'd3', stage: 'loi_submitted', resolution: 'won', asking_price: 300_000, revenue_ttm: 1_200_000, sde_ttm: 300_000, pipeline_stage: { key: 'loi_submitted', label: 'LOI Submitted', sort_order: 4 } }),
    makeRow({ id: 'd4', stage: 'pre_nda', asking_price: 50_000, revenue_ttm: 200_000, sde_ttm: 60_000, pipeline_stage: { key: 'pre_nda', label: 'Pre-NDA', sort_order: 2 } }),
    makeRow({ id: 'd5', stage: 'integration', asking_price: 400_000, revenue_ttm: 2_000_000, sde_ttm: 500_000, pipeline_stage: { key: 'integration', label: 'Integration', sort_order: 9 } }),
    makeRow({ id: 'd6', stage: 'nda_signed', archived_at: '2026-09-25T00:00:00.000Z', pipeline_stage: { key: 'nda_signed', label: 'NDA Signed', sort_order: 3 } }),
  ];
  return rows.map((row) => mapDealRow(row, USER, NOW));
}

describe('mapDealRow', () => {
  it('coalesces adopted financials over ttm and derives multiple and margin', () => {
    const item = mapDealRow(
      makeRow({
        id: 'x',
        asking_price: 300_000,
        revenue_ttm: 1_000_000,
        sde_ttm: 100_000,
        deal_financials: { adopted_revenue: 1_200_000, adopted_sde: 150_000 },
      }),
      USER,
      NOW,
    );

    expect(item.revenue).toBe(1_200_000);
    expect(item.sde).toBe(150_000);
    expect(item.multiple).toBeCloseTo(2);
    expect(item.margin).toBeCloseTo(0.125);
    expect(item.stageLabel).toBe('Sourcing');
    expect(item.industryName).toBe('Accounting');
    expect(item.locationName).toBe('Austin');
  });

  it('marks starred from the current user star rows', () => {
    const starred = mapDealRow(makeRow({ deal_star: [{ user_id: USER }] }), USER, NOW);
    const other = mapDealRow(makeRow({ deal_star: [{ user_id: 'someone-else' }] }), USER, NOW);

    expect(starred.starred).toBe(true);
    expect(other.starred).toBe(false);
  });
});

describe('grouping', () => {
  it('assigns groups with archived and resolution taking precedence over stage', () => {
    const byId = Object.fromEntries(candidates().map((item) => [item.id, item.group]));

    expect(byId.d1).toBe('early_funnel');
    expect(byId.d4).toBe('early_funnel');
    expect(byId.d2).toBe('actively_pursuing');
    expect(byId.d5).toBe('actively_pursuing');
    expect(byId.d3).toBe('closed_off_track');
    expect(byId.d6).toBe('archived');
  });
});

describe('buildDealListResult filtering', () => {
  it('narrows items by a stage filter and excludes archived by default', () => {
    const result = buildDealListResult(candidates(), { filters: { stage: ['nda_signed'] } });

    expect(result.items.map((item) => item.id)).toEqual(['d2']);
  });

  it('includes archived deals only when archived is true', () => {
    const result = buildDealListResult(candidates(), { filters: { archived: true, stage: ['nda_signed'] } });

    expect(result.items.map((item) => item.id).sort()).toEqual(['d2', 'd6']);
  });

  it('filters by starred', () => {
    const result = buildDealListResult(candidates(), { filters: { starred: true } });

    expect(result.items.map((item) => item.id)).toEqual(['d1']);
  });

  it('post-filters by computed multiple range', () => {
    const all = buildDealListResult(candidates(), { filters: {} });
    const tight = buildDealListResult(candidates(), { filters: { multipleMin: 1.4 } });

    expect(all.items.length).toBeGreaterThan(tight.items.length);
    expect(tight.items.every((item) => (item.multiple ?? 0) >= 1.4)).toBe(true);
  });
});

describe('facet counts', () => {
  it('counts each facet over all other active filters except itself', () => {
    const result = buildDealListResult(candidates(), { filters: { stage: ['nda_signed'] } });

    const stageCounts = Object.fromEntries(result.facetCounts.stage.map((row) => [row.value, row.count]));
    const resolutionCounts = Object.fromEntries(result.facetCounts.resolution.map((row) => [row.value, row.count]));

    expect(stageCounts.sourcing).toBe(1);
    expect(stageCounts.pre_nda).toBe(1);
    expect(stageCounts.nda_signed).toBe(1);
    expect(stageCounts.loi_submitted).toBe(1);
    expect(stageCounts.integration).toBe(1);

    expect(resolutionCounts.open).toBe(1);
    expect(resolutionCounts.won ?? 0).toBe(0);
  });

  it('counts starred and archived facets', () => {
    const result = buildDealListResult(candidates(), { filters: {} });

    expect(result.facetCounts.starred).toBe(1);
    expect(result.facetCounts.archived).toBe(1);
  });
});

describe('ranges', () => {
  it('reports min and max over the filtered set minus the range itself', () => {
    const result = buildDealListResult(candidates(), { filters: { stage: ['nda_signed'] } });

    expect(result.ranges.askingPrice).toEqual({ min: 200_000, max: 200_000 });
  });

  it('reports the full span when no filter is active', () => {
    const result = buildDealListResult(candidates(), { filters: {} });

    expect(result.ranges.askingPrice.min).toBe(50_000);
    expect(result.ranges.askingPrice.max).toBe(400_000);
  });
});

describe('sorting and pagination', () => {
  it('sorts by asking_price descending and paginates with a cursor', () => {
    const page1 = buildDealListResult(candidates(), { filters: {}, sort: 'asking_price', limit: 2 });

    expect(page1.items.map((item) => item.id)).toEqual(['d5', 'd3']);
    expect(page1.nextCursor).toBe('d3');

    const page2 = buildDealListResult(candidates(), {
      filters: {},
      sort: 'asking_price',
      limit: 2,
      cursor: page1.nextCursor ?? undefined,
    });

    expect(page2.items.map((item) => item.id)).toEqual(['d2', 'd1']);
  });
});

describe('listDealsFaceted query shape', () => {
  it('scopes to the account, applies websearch full-text search, and embeds joins', async () => {
    const calls: { select?: string; textSearch?: unknown[] } = {};
    const builder = {
      select(value: string) {
        calls.select = value;
        return this;
      },
      eq() {
        return this;
      },
      textSearch(...args: unknown[]) {
        calls.textSearch = args;
        return this;
      },
      then(resolve: (value: { data: DealFacetedRow[]; error: null }) => unknown) {
        return resolve({ data: [], error: null });
      },
    };
    const client = {
      from: vi.fn(() => builder),
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } }, error: null })) },
    };

    await listDealsFaceted(client as never, {
      accountId: 'acct-1',
      filters: { q: 'dentist' },
    });

    expect(client.from).toHaveBeenCalledWith('deal');
    expect(calls.select).toContain('deal_financials');
    expect(calls.select).toContain('pipeline_stage');
    expect(calls.select).toContain('deal_star');
    expect(calls.textSearch?.[0]).toBe('search_tsv');
    expect(calls.textSearch?.[1]).toBe('dentist');
    expect(calls.textSearch?.[2]).toMatchObject({ type: 'websearch', config: 'english' });
  });
});
