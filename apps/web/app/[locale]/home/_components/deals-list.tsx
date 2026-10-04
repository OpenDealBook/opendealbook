import type { ReactNode } from 'react';

import Link from 'next/link';

import {
  type DealListGroup,
  type DealListItem,
  type FacetCount,
  listDealsFaceted,
} from '@odb/deals';
import { listSavedViews } from '@odb/deals/server';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { Badge } from '@odb/ui/badge';
import { Button } from '@odb/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@odb/ui/table';

import { DealCard } from './deal-card';
import { DealRowActions } from './deal-row-actions';
import { DealsFilters, type FilterOption } from './deals-filters';
import {
  DEAL_COLUMNS,
  type DealColumnKey,
  type RawSearchParams,
  hasActiveFilters,
  parseDealParams,
} from './deals-search-params';
import { DealsViewToggle } from './deals-view-toggle';
import { SavedViewsBar } from './saved-views-bar';

const COLUMN_CELLS: Record<DealColumnKey, (deal: DealListItem) => ReactNode> = {
  stage: (deal) => deal.stageLabel ?? deal.stage,
  resolution: (deal) => resolutionLabel(deal.resolution, deal.resolutionReason),
  asking: (deal) => formatCurrency(deal.askingPrice),
  offer: (deal) => formatCurrency(deal.yourOffer),
  revenue: (deal) => formatCurrency(deal.revenue),
  sde: (deal) => formatCurrency(deal.sde),
  multiple: (deal) =>
    deal.multiple === null ? 'Not disclosed' : `${deal.multiple.toFixed(1)}x`,
  margin: (deal) =>
    deal.margin === null ? null : (
      <Badge variant={'outline'}>{Math.round(deal.margin * 100)}%</Badge>
    ),
  days: (deal) => deal.daysInStage ?? '',
};

const GROUP_ORDER: { group: DealListGroup; label: string }[] = [
  { group: 'actively_pursuing', label: 'Actively pursuing' },
  { group: 'early_funnel', label: 'Early funnel' },
  { group: 'closed_off_track', label: 'Closed / off track' },
  { group: 'archived', label: 'Archived' },
];

const RESOLUTION_LABELS: Record<string, string> = {
  open: 'Open',
  won: 'Won',
  lost: 'Lost',
};

const LISTING_STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  pulled: 'Pulled',
  sold: 'Sold',
};

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

function formatCurrency(value: number | null): string {
  return value === null ? 'Not disclosed' : currency.format(value);
}

function dealTitle(title: string | null): string {
  if (title === null) {
    return 'Untitled deal';
  }
  return title.replace(/^Example:\s*/, '');
}

function resolutionLabel(
  resolution: string | null,
  reason: string | null,
): string {
  if (resolution === null) {
    return '';
  }
  const outcome = resolution === 'won' ? 'Won' : 'Lost';
  return reason === null ? outcome : `${outcome} (${reason.replace(/_/g, ' ')})`;
}

function options(
  facet: FacetCount[],
  label: (value: string) => string,
): FilterOption[] {
  return facet
    .map((entry) => ({
      value: entry.value,
      label: label(entry.value),
      count: entry.count,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function nameMap(
  items: DealListItem[],
  id: (item: DealListItem) => string | null,
  name: (item: DealListItem) => string | null,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of items) {
    const key = id(item);
    const value = name(item);
    if (key !== null && value !== null) {
      map.set(key, value);
    }
  }
  return map;
}

function nextPageHref(
  params: RawSearchParams,
  cursor: string,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const raw = Array.isArray(value) ? value[0] : value;
    if (raw !== undefined && key !== 'cursor') {
      query.set(key, raw);
    }
  }
  query.set('cursor', cursor);
  return `?${query.toString()}`;
}

export async function DealsList({
  accountId,
  searchParams,
  detailBasePath,
}: {
  accountId: string;
  searchParams: RawSearchParams;
  detailBasePath: string;
}) {
  const client = getSupabaseServerClient();
  const { filters, sort, cursor, view, visibleColumns } =
    parseDealParams(searchParams);

  const result = await listDealsFaceted(client, {
    accountId,
    filters,
    sort,
    cursor,
  });

  const savedViews = await listSavedViews({ account_id: accountId });

  const columns = DEAL_COLUMNS.filter((column) =>
    visibleColumns.includes(column.key),
  );

  const stageLabels = nameMap(
    result.items,
    (item) => item.stage,
    (item) => item.stageLabel,
  );
  const industryNames = nameMap(
    result.items,
    (item) => item.industryId,
    (item) => item.industryName,
  );
  const locationNames = nameMap(
    result.items,
    (item) => item.locationId,
    (item) => item.locationName,
  );

  const grouped = GROUP_ORDER.map((section) => ({
    ...section,
    items: result.items.filter((item) => item.group === section.group),
  })).filter((section) => section.items.length > 0);

  return (
    <div className={'flex flex-col gap-6 lg:flex-row'}>
      <DealsFilters
        filters={filters}
        sort={sort}
        stageOptions={options(
          result.facetCounts.stage,
          (value) => stageLabels.get(value) ?? value,
        )}
        resolutionOptions={options(
          result.facetCounts.resolution,
          (value) => RESOLUTION_LABELS[value] ?? value,
        )}
        listingStatusOptions={options(
          result.facetCounts.listingStatus,
          (value) => LISTING_STATUS_LABELS[value] ?? value,
        )}
        industryOptions={options(
          result.facetCounts.industry,
          (value) => industryNames.get(value) ?? value,
        )}
        locationOptions={options(
          result.facetCounts.location,
          (value) => locationNames.get(value) ?? value,
        )}
        starredCount={result.facetCounts.starred}
        archivedCount={result.facetCounts.archived}
      />

      <div className={'flex min-w-0 flex-1 flex-col gap-4'}>
        <div className={'flex flex-wrap items-center justify-between gap-2'}>
          <SavedViewsBar
            views={savedViews}
            accountId={accountId}
            view={view}
          />
          <div className={'flex items-center gap-2'}>
            <DealsViewToggle view={view} />
            <Button asChild size={'sm'}>
              <Link href={`${detailBasePath}/new`}>New deal</Link>
            </Button>
          </div>
        </div>

        {result.items.length === 0 ? (
          <p className={'text-muted-foreground text-sm'}>
            {hasActiveFilters(searchParams)
              ? 'No deals match'
              : 'No deals yet'}
          </p>
        ) : (
          <>
            {view === 'table' ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    {columns.map((column) => (
                      <TableHead key={column.key}>{column.label}</TableHead>
                    ))}
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grouped.map((section) => (
                    <GroupSection
                      key={section.group}
                      label={section.label}
                      items={section.items}
                      columns={columns}
                      detailBasePath={detailBasePath}
                    />
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className={'flex flex-col gap-6'}>
                {grouped.map((section) => (
                  <section key={section.group} className={'flex flex-col gap-3'}>
                    <h2 className={'text-muted-foreground text-xs font-medium'}>
                      {section.label} ({section.items.length})
                    </h2>
                    <div
                      className={
                        'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3'
                      }
                    >
                      {section.items.map((deal) => (
                        <DealCard
                          key={deal.id}
                          deal={deal}
                          detailBasePath={detailBasePath}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}

            {result.nextCursor !== null ? (
              <div className={'pt-4'}>
                <Link
                  href={nextPageHref(searchParams, result.nextCursor)}
                  className={'text-sm underline'}
                >
                  Next page
                </Link>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function GroupSection({
  label,
  items,
  columns,
  detailBasePath,
}: {
  label: string;
  items: DealListItem[];
  columns: readonly { key: DealColumnKey; label: string }[];
  detailBasePath: string;
}) {
  return (
    <>
      <TableRow>
        <TableCell
          colSpan={columns.length + 2}
          className={'text-muted-foreground bg-muted/50 text-xs font-medium'}
        >
          {label} ({items.length})
        </TableCell>
      </TableRow>
      {items.map((deal) => (
        <TableRow key={deal.id}>
          <TableCell className={'flex items-center gap-2'}>
            <Link href={`${detailBasePath}/${deal.id}`} className={'hover:underline'}>
              {dealTitle(deal.title)}
            </Link>
            {deal.captureMethod === 'example' ? (
              <Badge variant={'secondary'}>Example</Badge>
            ) : null}
          </TableCell>
          {columns.map((column) => (
            <TableCell key={column.key}>{COLUMN_CELLS[column.key](deal)}</TableCell>
          ))}
          <TableCell>
            <DealRowActions
              dealId={deal.id}
              starred={deal.starred}
              archived={deal.archivedAt !== null}
            />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}
