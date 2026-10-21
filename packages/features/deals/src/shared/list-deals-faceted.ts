import { daysInStage, sdeMargin, sdeMultiple } from '@odb/calculators';
import type { getSupabaseBrowserClient } from '@odb/supabase/client';

import { dealDisplayName } from './deal-name';
import { DEAD_OFFER_STATUSES } from './queries';

type Client = ReturnType<typeof getSupabaseBrowserClient>;

export type DealResolution = 'open' | 'won' | 'lost';
export type DealListingStatus = 'active' | 'pulled' | 'sold';
export type DealListGroup =
  | 'actively_pursuing'
  | 'early_funnel'
  | 'closed_off_track'
  | 'archived';
export type DealSort =
  | 'updated'
  | 'created'
  | 'stage'
  | 'asking_price'
  | 'revenue'
  | 'sde'
  | 'multiple'
  | 'margin'
  | 'days_in_stage';

export interface DealListFilters {
  q?: string;
  stage?: string[];
  resolution?: DealResolution[];
  resolutionReasons?: string[];
  industryId?: string[];
  locationId?: string[];
  askingMin?: number;
  askingMax?: number;
  askingIncludeUndisclosed?: boolean;
  revenueMin?: number;
  revenueMax?: number;
  revenueIncludeUndisclosed?: boolean;
  sdeMin?: number;
  sdeMax?: number;
  sdeIncludeUndisclosed?: boolean;
  multipleMin?: number;
  multipleMax?: number;
  marginMin?: number;
  marginMax?: number;
  listingStatus?: DealListingStatus[];
  owner?: string | 'mine';
  starred?: boolean;
  daysInStageMin?: number;
  daysInStageMax?: number;
  archived?: boolean;
  examples?: boolean;
}

export interface NextMilestone {
  kind: string;
  label: string | null;
  targetOn: string;
}

export interface DealListItem {
  id: string;
  title: string;
  isExample: boolean;
  nextMilestone: NextMilestone | null;
  openItems: number;
  overdueItems: number;
  lastActivityAt: string;
  stage: string;
  stageLabel: string | null;
  stageSortOrder: number | null;
  resolution: string | null;
  resolutionReason: string | null;
  listingStatus: string;
  askingPrice: number | null;
  yourOffer: number | null;
  revenue: number | null;
  sde: number | null;
  multiple: number | null;
  margin: number | null;
  industryId: string | null;
  industryName: string | null;
  locationId: string | null;
  locationName: string | null;
  ownerUserId: string | null;
  starred: boolean;
  group: DealListGroup;
  archivedAt: string | null;
  daysInStage: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  captureMethod: string | null;
}

export interface FacetCount {
  value: string;
  count: number;
}

export interface DealListFacetCounts {
  stage: FacetCount[];
  resolution: FacetCount[];
  listingStatus: FacetCount[];
  industry: FacetCount[];
  location: FacetCount[];
  group: FacetCount[];
  starred: number;
  archived: number;
  examples: number;
}

export interface RangeBound {
  min: number | null;
  max: number | null;
}

export interface DealListRanges {
  askingPrice: RangeBound;
  revenue: RangeBound;
  sde: RangeBound;
}

export interface DealListResult {
  items: DealListItem[];
  facetCounts: DealListFacetCounts;
  ranges: DealListRanges;
  nextCursor: string | null;
}

export interface DealFacetedRow {
  id: string;
  description: string | null;
  stage: string;
  resolution: string | null;
  resolution_reason: string | null;
  listing_status: string;
  asking_price: number | null;
  revenue_ttm: number | null;
  sde_ttm: number | null;
  owner_user_id: string | null;
  archived_at: string | null;
  stage_changed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  capture_method: string | null;
  pipeline_stage: { key: string; label: string; sort_order: number } | null;
  deal_profile: {
    industry_id: string | null;
    location_id: string | null;
    industry: { name: string } | null;
    location: { city: string | null; region: string | null } | null;
  } | null;
  deal_financials: {
    adopted_revenue: number | null;
    adopted_sde: number | null;
  } | null;
  deal_star: { user_id: string }[];
  offer: {
    status: string;
    current_version_id: string | null;
    offer_version: { id: string; purchase_price: number }[];
  }[];
  firm: { name: string };
  deal_milestone: {
    kind: string;
    label: string | null;
    target_on: string | null;
    actual_on: string | null;
  }[];
  checklist_item: { status: string; due_at: string | null; removed_at: string | null }[];
  deal_event: { created_at: string }[];
}

export interface ListDealsFacetedParams {
  accountId: string;
  filters?: DealListFilters;
  sort?: DealSort;
  cursor?: string;
  limit?: number;
}

interface BuildParams {
  filters: DealListFilters;
  sort?: DealSort;
  cursor?: string;
  limit?: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const EARLY_FUNNEL_STAGES = new Set(['sourcing', 'pre_nda']);
const EXAMPLE_TAG = '[Example]';
const SETTLED_CHECKLIST_STATUSES = ['received', 'reviewed'];

const DEAL_FACETED_SELECT =
  'id, description, stage, resolution, resolution_reason, listing_status, asking_price, revenue_ttm, sde_ttm, owner_user_id, archived_at, stage_changed_at, created_at, updated_at, capture_method, pipeline_stage(key, label, sort_order), deal_profile(industry_id, location_id, industry(name), location(city, region)), deal_financials(adopted_revenue, adopted_sde), deal_star(user_id), offer(status, current_version_id, offer_version(id, purchase_price)), firm!inner(name), deal_milestone(kind, label, target_on, actual_on), checklist_item(status, due_at, removed_at), deal_event(created_at)';

function resolutionBucket(resolution: string | null): DealResolution {
  if (resolution === null) {
    return 'open';
  }
  return resolution as DealResolution;
}

function groupOf(resolution: string | null, stage: string, archivedAt: string | null): DealListGroup {
  if (archivedAt !== null) {
    return 'archived';
  }
  if (resolution !== null) {
    return 'closed_off_track';
  }
  if (EARLY_FUNNEL_STAGES.has(stage)) {
    return 'early_funnel';
  }
  return 'actively_pursuing';
}

function currentOfferPrice(offers: DealFacetedRow['offer']): number | null {
  const live = offers.find((offer) => !DEAD_OFFER_STATUSES.includes(offer.status));
  if (live === undefined) {
    return null;
  }
  return live.offer_version.find((version) => version.id === live.current_version_id)!
    .purchase_price;
}

function nextMilestone(milestones: DealFacetedRow['deal_milestone']): NextMilestone | null {
  const upcoming = milestones
    .filter((milestone) => milestone.actual_on === null && milestone.target_on !== null)
    .sort((a, b) => a.target_on!.localeCompare(b.target_on!));
  if (upcoming.length === 0) {
    return null;
  }
  const next = upcoming[0]!;
  return { kind: next.kind, label: next.label, targetOn: next.target_on! };
}

function locationLabel(location: { city: string | null; region: string | null } | null): string | null {
  if (location === null) {
    return null;
  }
  const parts = [location.city, location.region].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(', ') : null;
}

export function mapDealRow(
  row: DealFacetedRow,
  currentUserId: string | null,
  now: string,
): DealListItem {
  const revenue = row.deal_financials?.adopted_revenue ?? row.revenue_ttm;
  const sde = row.deal_financials?.adopted_sde ?? row.sde_ttm;
  const yourOffer = currentOfferPrice(row.offer);
  const today = now.slice(0, 10);
  const openItems = row.checklist_item.filter(
    (item) => item.removed_at === null && !SETTLED_CHECKLIST_STATUSES.includes(item.status),
  );

  return {
    id: row.id,
    title: dealDisplayName(row),
    isExample: row.firm.name.startsWith(EXAMPLE_TAG),
    nextMilestone: nextMilestone(row.deal_milestone),
    openItems: openItems.length,
    overdueItems: openItems.filter((item) => item.due_at !== null && item.due_at.slice(0, 10) < today).length,
    lastActivityAt: row.deal_event[0]!.created_at,
    stage: row.stage,
    stageLabel: row.pipeline_stage?.label ?? null,
    stageSortOrder: row.pipeline_stage?.sort_order ?? null,
    resolution: row.resolution,
    resolutionReason: row.resolution_reason,
    listingStatus: row.listing_status,
    askingPrice: row.asking_price,
    yourOffer,
    revenue,
    sde,
    multiple: sdeMultiple(row.asking_price, sde),
    margin: sdeMargin(sde, revenue),
    industryId: row.deal_profile?.industry_id ?? null,
    industryName: row.deal_profile?.industry?.name ?? null,
    locationId: row.deal_profile?.location_id ?? null,
    locationName: locationLabel(row.deal_profile?.location ?? null),
    ownerUserId: row.owner_user_id,
    starred: row.deal_star.some((star) => star.user_id === currentUserId),
    group: groupOf(row.resolution, row.stage, row.archived_at),
    archivedAt: row.archived_at,
    daysInStage: daysInStage(row.stage_changed_at, now),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    captureMethod: row.capture_method,
  };
}

type FacetKey =
  | 'stage'
  | 'resolution'
  | 'listingStatus'
  | 'industry'
  | 'location'
  | 'starred'
  | 'archived'
  | 'examples'
  | 'asking'
  | 'revenue'
  | 'sde';

function inRange(
  value: number | null,
  min: number | undefined,
  max: number | undefined,
  includeUndisclosed: boolean,
): boolean {
  if (min === undefined && max === undefined) {
    return true;
  }
  if (value === null) {
    return includeUndisclosed;
  }
  return (min === undefined || value >= min) && (max === undefined || value <= max);
}

function matches(item: DealListItem, f: DealListFilters, skip: FacetKey | null): boolean {
  if (skip !== 'archived' && f.archived !== true && item.archivedAt !== null) {
    return false;
  }
  if (skip !== 'examples' && (f.examples === true) !== item.isExample) {
    return false;
  }
  if (skip !== 'stage' && f.stage?.length && !f.stage.includes(item.stage)) {
    return false;
  }
  if (skip !== 'resolution') {
    if (f.resolution?.length && !f.resolution.includes(resolutionBucket(item.resolution))) {
      return false;
    }
    if (
      f.resolutionReasons?.length &&
      (item.resolutionReason === null || !f.resolutionReasons.includes(item.resolutionReason))
    ) {
      return false;
    }
  }
  if (
    skip !== 'listingStatus' &&
    f.listingStatus?.length &&
    !f.listingStatus.includes(item.listingStatus as DealListingStatus)
  ) {
    return false;
  }
  if (skip !== 'industry' && f.industryId?.length) {
    if (item.industryId === null || !f.industryId.includes(item.industryId)) {
      return false;
    }
  }
  if (skip !== 'location' && f.locationId?.length) {
    if (item.locationId === null || !f.locationId.includes(item.locationId)) {
      return false;
    }
  }
  if (skip !== 'asking' && !inRange(item.askingPrice, f.askingMin, f.askingMax, f.askingIncludeUndisclosed === true)) {
    return false;
  }
  if (skip !== 'revenue' && !inRange(item.revenue, f.revenueMin, f.revenueMax, f.revenueIncludeUndisclosed === true)) {
    return false;
  }
  if (skip !== 'sde' && !inRange(item.sde, f.sdeMin, f.sdeMax, f.sdeIncludeUndisclosed === true)) {
    return false;
  }
  if (!inRange(item.multiple, f.multipleMin, f.multipleMax, false)) {
    return false;
  }
  if (!inRange(item.margin, f.marginMin, f.marginMax, false)) {
    return false;
  }
  if (!inRange(item.daysInStage, f.daysInStageMin, f.daysInStageMax, false)) {
    return false;
  }
  if (f.owner !== undefined && item.ownerUserId !== f.owner) {
    return false;
  }
  if (skip !== 'starred' && f.starred === true && !item.starred) {
    return false;
  }
  return true;
}

function tally(items: DealListItem[], value: (item: DealListItem) => string | null): FacetCount[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = value(item);
    if (key !== null) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts].map(([value, count]) => ({ value, count }));
}

function rangeOf(items: DealListItem[], value: (item: DealListItem) => number | null): RangeBound {
  const values = items.map(value).filter((v): v is number => v !== null);
  if (values.length === 0) {
    return { min: null, max: null };
  }
  return { min: Math.min(...values), max: Math.max(...values) };
}

function compareNullable(a: number | null, b: number | null, direction: 'asc' | 'desc'): number {
  if (a === null && b === null) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }
  return direction === 'asc' ? a - b : b - a;
}

function sortKey(item: DealListItem, sort: DealSort): { value: number | null; direction: 'asc' | 'desc' } {
  switch (sort) {
    case 'stage':
      return { value: item.stageSortOrder, direction: 'asc' };
    case 'created':
      return { value: item.createdAt === null ? null : Date.parse(item.createdAt), direction: 'desc' };
    case 'asking_price':
      return { value: item.askingPrice, direction: 'desc' };
    case 'revenue':
      return { value: item.revenue, direction: 'desc' };
    case 'sde':
      return { value: item.sde, direction: 'desc' };
    case 'multiple':
      return { value: item.multiple, direction: 'desc' };
    case 'margin':
      return { value: item.margin, direction: 'desc' };
    case 'days_in_stage':
      return { value: item.daysInStage, direction: 'desc' };
    case 'updated':
      return { value: item.updatedAt === null ? null : Date.parse(item.updatedAt), direction: 'desc' };
  }
}

function sortItems(items: DealListItem[], sort: DealSort): DealListItem[] {
  return [...items].sort((a, b) => {
    const ka = sortKey(a, sort);
    const kb = sortKey(b, sort);
    const primary = compareNullable(ka.value, kb.value, ka.direction);
    return primary !== 0 ? primary : a.id.localeCompare(b.id);
  });
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || limit < 1) {
    return DEFAULT_LIMIT;
  }
  return Math.min(limit, MAX_LIMIT);
}

export function buildDealListResult(candidates: DealListItem[], params: BuildParams): DealListResult {
  const { filters } = params;
  const sort = params.sort ?? 'updated';
  const limit = clampLimit(params.limit);

  const matched = candidates.filter((item) => matches(item, filters, null));
  const sorted = sortItems(matched, sort);

  const start = params.cursor === undefined ? 0 : sorted.findIndex((item) => item.id === params.cursor) + 1;
  const page = sorted.slice(start, start + limit);
  const nextCursor = start + limit < sorted.length ? page[page.length - 1]!.id : null;

  const facetCounts: DealListFacetCounts = {
    stage: tally(candidates.filter((item) => matches(item, filters, 'stage')), (item) => item.stage),
    resolution: tally(
      candidates.filter((item) => matches(item, filters, 'resolution')),
      (item) => resolutionBucket(item.resolution),
    ),
    listingStatus: tally(
      candidates.filter((item) => matches(item, filters, 'listingStatus')),
      (item) => item.listingStatus,
    ),
    industry: tally(candidates.filter((item) => matches(item, filters, 'industry')), (item) => item.industryId),
    location: tally(candidates.filter((item) => matches(item, filters, 'location')), (item) => item.locationId),
    group: tally(matched, (item) => item.group),
    starred: candidates.filter((item) => matches(item, filters, 'starred') && item.starred).length,
    archived: candidates.filter((item) => matches(item, filters, 'archived') && item.archivedAt !== null).length,
    examples: candidates.filter((item) => matches(item, filters, 'examples') && item.isExample).length,
  };

  const ranges: DealListRanges = {
    askingPrice: rangeOf(candidates.filter((item) => matches(item, filters, 'asking')), (item) => item.askingPrice),
    revenue: rangeOf(candidates.filter((item) => matches(item, filters, 'revenue')), (item) => item.revenue),
    sde: rangeOf(candidates.filter((item) => matches(item, filters, 'sde')), (item) => item.sde),
  };

  return { items: page, facetCounts, ranges, nextCursor };
}

export async function listDealsFaceted(
  client: Client,
  params: ListDealsFacetedParams,
): Promise<DealListResult> {
  const filters = params.filters ?? {};
  const now = new Date().toISOString();

  const auth = await client.auth.getUser();
  const currentUserId = auth.data.user?.id ?? null;
  const owner = filters.owner === 'mine' ? currentUserId ?? undefined : filters.owner;

  let query = client
    .from('deal')
    .select(DEAL_FACETED_SELECT)
    .eq('account_id', params.accountId)
    .order('created_at', { referencedTable: 'deal_event', ascending: false })
    .limit(1, { referencedTable: 'deal_event' });

  if (filters.q) {
    query = query.textSearch('search_tsv', filters.q, { type: 'websearch', config: 'english' });
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const candidates = (data as unknown as DealFacetedRow[]).map((row) => mapDealRow(row, currentUserId, now));

  return buildDealListResult(candidates, {
    filters: { ...filters, owner },
    sort: params.sort,
    cursor: params.cursor,
    limit: params.limit,
  });
}
