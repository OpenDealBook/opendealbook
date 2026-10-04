import type {
  DealListFilters,
  DealListingStatus,
  DealResolution,
  DealSort,
} from '@odb/deals';

export const DEAL_PARAM = {
  q: 'q',
  stage: 'stage',
  resolution: 'resolution',
  listingStatus: 'listing',
  industry: 'industry',
  location: 'location',
  askingMin: 'askMin',
  askingMax: 'askMax',
  askingUndisclosed: 'askUndisc',
  revenueMin: 'revMin',
  revenueMax: 'revMax',
  revenueUndisclosed: 'revUndisc',
  sdeMin: 'sdeMin',
  sdeMax: 'sdeMax',
  sdeUndisclosed: 'sdeUndisc',
  starred: 'starred',
  archived: 'archived',
  sort: 'sort',
  cursor: 'cursor',
  view: 'view',
  cols: 'cols',
} as const;

export type RawSearchParams = Record<string, string | string[] | undefined>;

export type DealView = 'cards' | 'table';

export const DEAL_COLUMNS = [
  { key: 'stage', label: 'Stage' },
  { key: 'resolution', label: 'Resolution' },
  { key: 'asking', label: 'Asking price' },
  { key: 'offer', label: 'Your offer' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'sde', label: 'SDE' },
  { key: 'multiple', label: 'Multiple' },
  { key: 'margin', label: 'Margin' },
  { key: 'days', label: 'Days in stage' },
] as const;

export type DealColumnKey = (typeof DEAL_COLUMNS)[number]['key'];

export const DEFAULT_VISIBLE_COLUMNS: DealColumnKey[] = DEAL_COLUMNS.map(
  (column) => column.key,
);

export interface ParsedDealParams {
  filters: DealListFilters;
  sort: DealSort;
  cursor?: string;
  view: DealView;
  visibleColumns: DealColumnKey[];
}

const SORTS: DealSort[] = [
  'updated',
  'created',
  'stage',
  'asking_price',
  'revenue',
  'sde',
  'multiple',
  'margin',
  'days_in_stage',
];

function first(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw !== undefined && raw.length > 0 ? raw : undefined;
}

function csv(value: string | string[] | undefined): string[] | undefined {
  const raw = first(value);
  if (raw === undefined) {
    return undefined;
  }
  const parts = raw.split(',').filter((part) => part.length > 0);
  return parts.length > 0 ? parts : undefined;
}

function num(value: string | string[] | undefined): number | undefined {
  const raw = first(value);
  if (raw === undefined) {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function flag(value: string | string[] | undefined): boolean | undefined {
  return first(value) === '1' ? true : undefined;
}

function parseSort(value: string | string[] | undefined): DealSort {
  const raw = first(value);
  return raw !== undefined && (SORTS as string[]).includes(raw)
    ? (raw as DealSort)
    : 'updated';
}

function parseView(value: string | string[] | undefined): DealView {
  return first(value) === 'table' ? 'table' : 'cards';
}

const COLUMN_KEYS = new Set<string>(DEFAULT_VISIBLE_COLUMNS);

function parseColumns(value: string | string[] | undefined): DealColumnKey[] {
  const raw = csv(value);
  if (raw === undefined) {
    return DEFAULT_VISIBLE_COLUMNS;
  }
  return raw.filter((part): part is DealColumnKey => COLUMN_KEYS.has(part));
}

export function parseDealParams(params: RawSearchParams): ParsedDealParams {
  const filters: DealListFilters = {
    q: first(params[DEAL_PARAM.q]),
    stage: csv(params[DEAL_PARAM.stage]),
    resolution: csv(params[DEAL_PARAM.resolution]) as
      | DealResolution[]
      | undefined,
    listingStatus: csv(params[DEAL_PARAM.listingStatus]) as
      | DealListingStatus[]
      | undefined,
    industryId: csv(params[DEAL_PARAM.industry]),
    locationId: csv(params[DEAL_PARAM.location]),
    askingMin: num(params[DEAL_PARAM.askingMin]),
    askingMax: num(params[DEAL_PARAM.askingMax]),
    askingIncludeUndisclosed: flag(params[DEAL_PARAM.askingUndisclosed]),
    revenueMin: num(params[DEAL_PARAM.revenueMin]),
    revenueMax: num(params[DEAL_PARAM.revenueMax]),
    revenueIncludeUndisclosed: flag(params[DEAL_PARAM.revenueUndisclosed]),
    sdeMin: num(params[DEAL_PARAM.sdeMin]),
    sdeMax: num(params[DEAL_PARAM.sdeMax]),
    sdeIncludeUndisclosed: flag(params[DEAL_PARAM.sdeUndisclosed]),
    starred: flag(params[DEAL_PARAM.starred]),
    archived: flag(params[DEAL_PARAM.archived]),
  };

  return {
    filters,
    sort: parseSort(params[DEAL_PARAM.sort]),
    cursor: first(params[DEAL_PARAM.cursor]),
    view: parseView(params[DEAL_PARAM.view]),
    visibleColumns: parseColumns(params[DEAL_PARAM.cols]),
  };
}

export function viewToSearchParams(view: {
  filters: DealListFilters;
  sort?: string;
  visibleColumns?: string[];
}): URLSearchParams {
  const params = new URLSearchParams();
  const f = view.filters;

  const setValue = (key: string, value: string | number | undefined) => {
    if (value !== undefined && String(value).length > 0) {
      params.set(key, String(value));
    }
  };
  const setCsv = (key: string, value: string[] | undefined) => {
    if (value !== undefined && value.length > 0) {
      params.set(key, value.join(','));
    }
  };
  const setFlag = (key: string, value: boolean | undefined) => {
    if (value === true) {
      params.set(key, '1');
    }
  };

  setValue(DEAL_PARAM.q, f.q);
  setCsv(DEAL_PARAM.stage, f.stage);
  setCsv(DEAL_PARAM.resolution, f.resolution);
  setCsv(DEAL_PARAM.listingStatus, f.listingStatus);
  setCsv(DEAL_PARAM.industry, f.industryId);
  setCsv(DEAL_PARAM.location, f.locationId);
  setValue(DEAL_PARAM.askingMin, f.askingMin);
  setValue(DEAL_PARAM.askingMax, f.askingMax);
  setFlag(DEAL_PARAM.askingUndisclosed, f.askingIncludeUndisclosed);
  setValue(DEAL_PARAM.revenueMin, f.revenueMin);
  setValue(DEAL_PARAM.revenueMax, f.revenueMax);
  setFlag(DEAL_PARAM.revenueUndisclosed, f.revenueIncludeUndisclosed);
  setValue(DEAL_PARAM.sdeMin, f.sdeMin);
  setValue(DEAL_PARAM.sdeMax, f.sdeMax);
  setFlag(DEAL_PARAM.sdeUndisclosed, f.sdeIncludeUndisclosed);
  setFlag(DEAL_PARAM.starred, f.starred);
  setFlag(DEAL_PARAM.archived, f.archived);
  setValue(DEAL_PARAM.sort, view.sort);
  setCsv(DEAL_PARAM.cols, view.visibleColumns);

  return params;
}

export function hasActiveFilters(params: RawSearchParams): boolean {
  const ignored = new Set<string>([
    DEAL_PARAM.sort,
    DEAL_PARAM.cursor,
    DEAL_PARAM.view,
  ]);
  return Object.entries(params).some(
    ([key, value]) => !ignored.has(key) && first(value) !== undefined,
  );
}
