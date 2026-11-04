// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

import type { DealListItem, DealListResult } from '@odb/deals';

import messages from '../../../../messages/en.json';

const listing = vi.hoisted(() => ({ result: null as unknown }));

vi.mock('@odb/deals', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listDealsFaceted: async () => listing.result,
}));
vi.mock('@odb/deals/server', () => ({
  listSavedViews: async () => [],
  saveView: async () => {},
  deleteSavedView: async () => {},
}));
vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({}),
}));
vi.mock('@odb/supabase/admin', () => {
  const query = {
    from: () => query,
    select: () => query,
    eq: () => query,
    in: () => query,
    throwOnError: async () => ({ data: [] }),
  };
  return { getSupabaseServerAdminClient: () => query };
});
vi.mock('next/navigation', () => ({
  useRouter: () => ({}),
  usePathname: () => '/home/acme/deals',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => (key: string) =>
    `${namespace}.${key}`
      .split('.')
      .reduce<unknown>(
        (node, part) => (node as Record<string, unknown>)[part],
        messages,
      ),
}));

import { DealsList, DealsTable } from './deals-list';
import { DEAL_COLUMNS } from './deals-search-params';

const deal: DealListItem = {
  id: 'd-1',
  title: 'Harbor Plumbing',
  isExample: false,
  nextMilestone: null,
  openItems: 0,
  overdueItems: 0,
  lastActivityAt: '2026-10-14T16:30:00Z',
  stage: 'nda_signed',
  stageLabel: 'NDA Signed',
  stageSortOrder: 3,
  resolution: null,
  resolutionReason: null,
  listingStatus: 'active',
  askingPrice: 1_250_000,
  yourOffer: null,
  revenue: null,
  sde: null,
  multiple: null,
  margin: null,
  industryId: null,
  industryName: null,
  locationId: null,
  locationName: null,
  ownerUserId: null,
  starred: false,
  group: 'actively_pursuing',
  archivedAt: null,
  daysInStage: null,
  createdAt: null,
  updatedAt: null,
  captureMethod: null,
};

it('shows the asking price as right-aligned compact money with the exact amount on hover', () => {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(
    <DealsTable
      sections={[
        {
          group: 'actively_pursuing',
          label: 'Actively pursuing',
          items: [deal],
        },
      ]}
      columns={DEAL_COLUMNS.filter((column) => column.key === 'asking')}
      isOwner={false}
      detailBasePath={'/home/acme/deals'}
    />,
  );

  const header = [...host.querySelectorAll('th')].find(
    (th) => th.textContent === 'Asking price',
  )!;
  const cell = [...host.querySelectorAll('td')].find(
    (td) => td.textContent === '$1.25M',
  )!;

  expect(header.className).toContain('text-right');
  expect(cell.className).toContain('text-right');
  expect(cell.className).toContain('tabular-nums');
  expect(cell.querySelector('[title]')!.getAttribute('title')).toBe(
    '$1,250,000',
  );
});

it('shows the stage as a stage chip, muted red once the deal is lost', () => {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(
    <DealsTable
      sections={[
        {
          group: 'closed_off_track',
          label: 'Closed / off track',
          items: [{ ...deal, resolution: 'lost' }],
        },
      ]}
      columns={DEAL_COLUMNS.filter((column) => column.key === 'stage')}
      isOwner={false}
      detailBasePath={'/home/acme/deals'}
    />,
  );

  const chip = host.querySelector('[data-slot="stage-chip"]')!;

  expect(chip.textContent).toBe('NDA Signed');
  expect(chip.className).toContain('bg-stage-lost');
});

it('mutes an archived row, tags it Archived and mutes its stage chip', () => {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(
    <DealsTable
      sections={[
        {
          group: 'archived',
          label: 'Archived deals',
          items: [{ ...deal, archivedAt: '2026-10-01T00:00:00Z' }],
        },
        {
          group: 'actively_pursuing',
          label: 'Actively pursuing',
          items: [{ ...deal, id: 'd-2', title: 'Live Deal' }],
        },
      ]}
      columns={DEAL_COLUMNS.filter((column) => column.key === 'stage')}
      isOwner={false}
      detailBasePath={'/home/acme/deals'}
    />,
  );

  const rows = [...host.querySelectorAll('tbody tr')];
  const archived = rows.find((row) =>
    row.textContent!.includes('Harbor Plumbing'),
  )!;
  const live = rows.find((row) => row.textContent!.includes('Live Deal'))!;

  expect(archived.className).toContain('bg-muted/40');
  expect(archived.className).not.toContain('opacity');
  expect(archived.textContent).toContain('Archived');
  expect(
    archived.querySelector('[data-slot="stage-chip"]')!.className,
  ).toContain('bg-muted text-muted-foreground');
  expect(live.className).not.toContain('bg-muted/40');
  expect(live.textContent).not.toContain('Archived');
});

const noDeals: DealListResult = {
  items: [],
  facetCounts: {
    stage: [],
    resolution: [],
    listingStatus: [],
    industry: [],
    location: [],
    group: [],
    starred: 0,
    archived: 0,
    examples: 0,
  },
  ranges: {
    askingPrice: { min: null, max: null },
    revenue: { min: null, max: null },
    sde: { min: null, max: null },
  },
  nextCursor: null,
};

async function renderEmpty(
  searchParams: Record<string, string>,
  canCreate = true,
) {
  listing.result = noDeals;
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(
    await DealsList({
      accountId: 'team-1',
      isOwner: true,
      canCreate,
      searchParams,
      detailBasePath: '/home/acme/deals',
    }),
  );
  return host;
}

async function emptyState(
  searchParams: Record<string, string>,
  canCreate = true,
) {
  const host = await renderEmpty(searchParams, canCreate);
  return host.querySelector('[data-slot="empty-state"]')!;
}

it('offers a new deal when the team has none yet', async () => {
  const empty = await emptyState({});

  expect(empty.querySelector('h2')!.textContent).toBe(
    messages.empty.deals.title,
  );
  expect(
    empty.querySelector('a[href="/home/acme/deals/new"]')!.textContent,
  ).toBe(messages.empty.deals.action);
});

it('offers no new deal to someone who cannot create deals and sends them to a teammate', async () => {
  const host = await renderEmpty({}, false);
  const empty = host.querySelector('[data-slot="empty-state"]')!;

  expect(empty.querySelector('h2')!.textContent).toBe(
    messages.empty.deals.title,
  );
  expect(empty.textContent).toContain(messages.empty.deals.descriptionNoAccess);
  expect(host.querySelector('a[href="/home/acme/deals/new"]')).toBeNull();
});

it('offers to clear the filters when no deal matches them, keeping the view and sort', async () => {
  const empty = await emptyState({
    stage: 'nda_signed',
    q: 'harbor',
    view: 'table',
    sort: 'asking_price',
  });

  expect(empty.querySelector('h2')!.textContent).toBe(
    messages.empty.dealsFiltered.title,
  );
  const clear = [...empty.querySelectorAll('a')].find(
    (link) => link.textContent === messages.empty.dealsFiltered.action,
  )!;
  const href = new URL(clear.getAttribute('href')!, 'https://odb.test');
  expect(href.pathname).toBe('/home/acme/deals');
  expect(Object.fromEntries(href.searchParams)).toEqual({
    view: 'table',
    sort: 'asking_price',
  });
  expect(empty.querySelector('a[href="/home/acme/deals/new"]')).toBeNull();
});

it('clears filters back to the plain list when no view or sort was chosen', async () => {
  const empty = await emptyState({ stage: 'nda_signed' });

  expect(empty.querySelector('a[href="/home/acme/deals"]')!.textContent).toBe(
    messages.empty.dealsFiltered.action,
  );
});

it('shows a dash for a missing multiple, margin and days in stage, as not available', () => {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(
    <DealsTable
      sections={[
        {
          group: 'actively_pursuing',
          label: 'Actively pursuing',
          items: [deal],
        },
      ]}
      columns={DEAL_COLUMNS.filter((column) =>
        ['multiple', 'margin', 'days'].includes(column.key),
      )}
      isOwner={false}
      detailBasePath={'/home/acme/deals'}
    />,
  );

  const cells = [...host.querySelectorAll('tbody tr:last-child td')].slice(
    1,
    4,
  );

  expect(
    cells.map((cell) => [
      cell.textContent,
      cell.querySelector('[data-slot="missing-value"]')?.getAttribute('title'),
    ]),
  ).toEqual([
    ['–', 'Not available'],
    ['–', 'Not available'],
    ['–', 'Not available'],
  ]);
});
