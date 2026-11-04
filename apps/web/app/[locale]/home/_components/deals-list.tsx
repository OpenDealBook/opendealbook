import type { ReactNode } from 'react';

import Link from 'next/link';

import { Briefcase, ListFilter } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import {
  type DealListGroup,
  type DealListItem,
  type FacetCount,
  listDealsFaceted,
} from '@odb/deals';
import { listSavedViews } from '@odb/deals/server';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { Badge } from '@odb/ui/badge';
import { Button } from '@odb/ui/button';
import { EmptyState } from '@odb/ui/empty-state';
import { FigureValue, MissingValue } from '@odb/ui/figure-value';
import { StageChip } from '@odb/ui/stage-chip';
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
  DEAL_PARAM,
  hasActiveFilters,
  parseDealParams,
} from './deals-search-params';
import { DealsViewToggle } from './deals-view-toggle';
import { SavedViewsBar } from './saved-views-bar';

const COLUMN_CELLS: Record<
  DealColumnKey,
  { numeric: boolean; cell: (deal: DealListItem) => ReactNode }
> = {
  stage: {
    numeric: false,
    cell: (deal) => (
      <StageChip
        stage={deal.stage}
        lost={deal.resolution === 'lost'}
        className={
          deal.archivedAt === null
            ? undefined
            : 'bg-muted text-muted-foreground'
        }
      >
        {deal.stageLabel ?? deal.stage}
      </StageChip>
    ),
  },
  resolution: {
    numeric: false,
    cell: (deal) => resolutionLabel(deal.resolution, deal.resolutionReason),
  },
  asking: {
    numeric: true,
    cell: (deal) => <FigureValue value={deal.askingPrice} format={'money'} />,
  },
  offer: {
    numeric: true,
    cell: (deal) => <FigureValue value={deal.yourOffer} format={'money'} />,
  },
  revenue: {
    numeric: true,
    cell: (deal) => <FigureValue value={deal.revenue} format={'money'} />,
  },
  sde: {
    numeric: true,
    cell: (deal) => <FigureValue value={deal.sde} format={'money'} />,
  },
  multiple: {
    numeric: true,
    cell: (deal) => (
      <FigureValue value={deal.multiple} format={'multiple'} calculated />
    ),
  },
  margin: {
    numeric: true,
    cell: (deal) =>
      deal.margin === null ? (
        <MissingValue calculated />
      ) : (
        <Badge variant={'outline'}>
          <FigureValue value={deal.margin} format={'percent'} />
        </Badge>
      ),
  },
  days: {
    numeric: true,
    cell: (deal) => deal.daysInStage ?? <MissingValue calculated />,
  },
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

function resolutionLabel(
  resolution: string | null,
  reason: string | null,
): string {
  if (resolution === null) {
    return '';
  }
  const outcome = resolution === 'won' ? 'Won' : 'Lost';
  return reason === null
    ? outcome
    : `${outcome} (${reason.replace(/_/g, ' ')})`;
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

function nextPageHref(params: RawSearchParams, cursor: string): string {
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

function clearedFiltersHref(params: RawSearchParams, basePath: string): string {
  const query = new URLSearchParams();
  for (const key of [DEAL_PARAM.view, DEAL_PARAM.sort]) {
    const value = params[key];
    const raw = Array.isArray(value) ? value[0] : value;
    if (raw !== undefined) {
      query.set(key, raw);
    }
  }
  return query.size > 0 ? `${basePath}?${query.toString()}` : basePath;
}

export async function DealsList({
  accountId,
  isOwner,
  canCreate,
  searchParams,
  detailBasePath,
}: {
  accountId: string;
  isOwner: boolean;
  canCreate: boolean;
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

  const ownerIds = [
    ...new Set(
      result.items
        .map((item) => item.ownerUserId)
        .filter((id): id is string => id !== null),
    ),
  ];

  const [t, savedViews, { data: owners }] = await Promise.all([
    getTranslations('empty'),
    listSavedViews({ account_id: accountId }),
    // Service role: teammates cannot read each other's personal accounts, and
    // these ids come from deals the caller was already allowed to read.
    getSupabaseServerAdminClient()
      .from('accounts')
      .select('primary_owner_user_id, name')
      .eq('is_personal_account', true)
      .in('primary_owner_user_id', ownerIds)
      .throwOnError(),
  ]);

  const ownerNames = new Map(
    owners.map((owner) => [owner.primary_owner_user_id, owner.name]),
  );

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
        examplesCount={result.facetCounts.examples}
      />

      <div className={'flex min-w-0 flex-1 flex-col gap-4'}>
        <div className={'flex flex-wrap items-center justify-between gap-2'}>
          <SavedViewsBar views={savedViews} accountId={accountId} view={view} />
          <div className={'flex items-center gap-2'}>
            <DealsViewToggle view={view} />
            {canCreate ? (
              <Button asChild size={'sm'}>
                <Link href={`${detailBasePath}/new`}>New deal</Link>
              </Button>
            ) : null}
          </div>
        </div>

        {result.items.length === 0 ? (
          hasActiveFilters(searchParams) ? (
            <EmptyState
              icon={ListFilter}
              title={t('dealsFiltered.title')}
              description={t('dealsFiltered.description')}
              action={
                <Button asChild variant={'outline'} size={'sm'}>
                  <Link href={clearedFiltersHref(searchParams, detailBasePath)}>
                    {t('dealsFiltered.action')}
                  </Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Briefcase}
              title={t('deals.title')}
              description={
                canCreate
                  ? t('deals.description')
                  : t('deals.descriptionNoAccess')
              }
              action={
                canCreate ? (
                  <Button asChild size={'sm'}>
                    <Link href={`${detailBasePath}/new`}>
                      {t('deals.action')}
                    </Link>
                  </Button>
                ) : null
              }
            />
          )
        ) : (
          <>
            {view === 'table' ? (
              <DealsTable
                sections={grouped}
                columns={columns}
                isOwner={isOwner}
                detailBasePath={detailBasePath}
              />
            ) : (
              <div className={'flex flex-col gap-6'}>
                {grouped.map((section) => (
                  <section
                    key={section.group}
                    className={'flex flex-col gap-3'}
                  >
                    <h2 className={'text-muted-foreground text-xs font-medium'}>
                      {section.label} ({section.items.length})
                    </h2>
                    <div
                      className={
                        'grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-4'
                      }
                    >
                      {section.items.map((deal) => (
                        <DealCard
                          key={deal.id}
                          deal={deal}
                          ownerName={
                            deal.ownerUserId === null
                              ? null
                              : ownerNames.get(deal.ownerUserId)!
                          }
                          isOwner={isOwner}
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

export function DealsTable({
  sections,
  columns,
  isOwner,
  detailBasePath,
}: {
  sections: { group: DealListGroup; label: string; items: DealListItem[] }[];
  columns: readonly { key: DealColumnKey; label: string }[];
  isOwner: boolean;
  detailBasePath: string;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          {columns.map((column) => (
            <TableHead
              key={column.key}
              numeric={COLUMN_CELLS[column.key].numeric}
            >
              {column.label}
            </TableHead>
          ))}
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sections.map((section) => (
          <GroupSection
            key={section.group}
            label={section.label}
            items={section.items}
            columns={columns}
            isOwner={isOwner}
            detailBasePath={detailBasePath}
          />
        ))}
      </TableBody>
    </Table>
  );
}

function GroupSection({
  label,
  items,
  columns,
  isOwner,
  detailBasePath,
}: {
  label: string;
  items: DealListItem[];
  columns: readonly { key: DealColumnKey; label: string }[];
  isOwner: boolean;
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
        <TableRow
          key={deal.id}
          className={deal.archivedAt === null ? undefined : 'bg-muted/40'}
        >
          <TableCell className={'flex items-center gap-2'}>
            <Link
              href={`${detailBasePath}/${deal.id}`}
              className={'hover:underline'}
            >
              {deal.title}
            </Link>
            {deal.isExample ? (
              <Badge variant={'secondary'}>Example</Badge>
            ) : null}
            {deal.archivedAt === null ? null : (
              <Badge variant={'outline'}>Archived</Badge>
            )}
          </TableCell>
          {columns.map((column) => (
            <TableCell
              key={column.key}
              numeric={COLUMN_CELLS[column.key].numeric}
            >
              {COLUMN_CELLS[column.key].cell(deal)}
            </TableCell>
          ))}
          <TableCell>
            <DealRowActions
              dealId={deal.id}
              dealName={deal.title}
              starred={deal.starred}
              archived={deal.archivedAt !== null}
              isOwner={isOwner}
            />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}
