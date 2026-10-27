'use client';

import { useEffect } from 'react';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@odb/ui/dropdown-menu';

interface Page {
  segment: string;
  label: string;
  href?: string;
}

const TABS: { segment: string; label: string; pages: Page[] }[] = [
  { segment: '', label: 'Overview', pages: [] },
  {
    segment: 'diligence',
    label: 'Diligence',
    pages: [
      { segment: 'diligence', label: 'Checklist' },
      { segment: 'todos', label: 'To-dos' },
      { segment: 'schedule', label: 'Schedule' },
      { segment: 'meetings', label: 'Meetings' },
      { segment: 'background', label: 'Background' },
      { segment: '', label: 'Seller Q&A', href: 'parties#seller-room' },
    ],
  },
  {
    segment: 'parties',
    label: 'Parties',
    pages: [
      { segment: 'parties', label: 'People' },
      { segment: 'lenders', label: 'Lenders' },
    ],
  },
  { segment: 'documents', label: 'Documents', pages: [] },
  {
    segment: 'financials',
    label: 'Financials',
    pages: [
      { segment: 'financials', label: 'Analysis' },
      { segment: 'worksheets', label: 'Worksheets' },
      { segment: 'workbooks', label: 'Workbooks' },
    ],
  },
];

const POST_CLOSE: Page[] = [
  { segment: 'operating', label: 'Operating' },
  { segment: 'hr-audit', label: 'HR audit' },
  { segment: 'customer-transition', label: 'Customer transition' },
];

const MOVED_ANCHORS: Record<string, string> = { '#seller-room': 'parties' };

const MARKER = '/deals/';

const LINK_CLASS =
  'rounded-md font-medium text-muted-foreground hover:text-foreground aria-[current]:bg-muted aria-[current]:text-foreground';
const TAB_CLASS = `${LINK_CLASS} px-3 py-1.5 text-sm`;

export function DealSubnav({
  showLenders = false,
  offerAccepted = false,
}: {
  showLenders?: boolean;
  offerAccepted?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const markerIndex = pathname.indexOf(MARKER);
  const afterDeals = pathname.slice(markerIndex + MARKER.length);
  const [dealId = ''] = afterDeals.split('/');
  const base = pathname.slice(0, markerIndex + MARKER.length) + dealId;
  const [current = ''] = afterDeals
    .slice(dealId.length)
    .replace(/^\//, '')
    .split('/');

  useEffect(() => {
    const tab = MOVED_ANCHORS[window.location.hash];

    if (current === '' && tab) {
      router.replace(`${base}/${tab}${window.location.hash}`);
    }
  }, [base, current, router]);

  const hrefOf = (page: Page) =>
    page.href
      ? `${base}/${page.href}`
      : page.segment === ''
        ? base
        : `${base}/${page.segment}`;
  const tabs = TABS.map((tab) => ({
    ...tab,
    pages: tab.pages.filter(
      (page) => showLenders || page.segment !== 'lenders',
    ),
  }));
  const activeTab = tabs.find(
    (tab) =>
      tab.segment === current ||
      tab.pages.some((page) => !page.href && page.segment === current),
  );
  const subpages =
    activeTab && activeTab.pages.length > 1 ? activeTab.pages : [];
  const inPostClose = POST_CLOSE.some((page) => page.segment === current);

  return (
    <nav className={'-mx-4 flex flex-col gap-1 px-4 pb-2 lg:mx-0 lg:px-0'}>
      <div className={'flex gap-1 overflow-x-auto whitespace-nowrap'}>
        {tabs.map((tab) => (
          <Link
            key={tab.label}
            href={hrefOf(tab)}
            aria-current={
              tab === activeTab
                ? subpages.length > 0
                  ? 'true'
                  : 'page'
                : undefined
            }
            className={TAB_CLASS}
          >
            {tab.label}
          </Link>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-current={inPostClose ? 'page' : undefined}
            className={`${TAB_CLASS} inline-flex items-center gap-1.5`}
          >
            Post-close
            {offerAccepted ? (
              <span
                className={
                  'bg-primary/10 text-primary rounded-full px-1.5 py-0.5 text-xs'
                }
              >
                Offer accepted
              </span>
            ) : null}
          </DropdownMenuTrigger>
          <DropdownMenuContent align={'start'}>
            {POST_CLOSE.map((page) => (
              <DropdownMenuItem key={page.segment} asChild>
                <Link href={hrefOf(page)}>{page.label}</Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {subpages.length > 0 ? (
        <div className={'flex gap-1 overflow-x-auto whitespace-nowrap'}>
          {subpages.map((page) => (
            <Link
              key={page.label}
              href={hrefOf(page)}
              aria-current={
                !page.href && page.segment === current ? 'page' : undefined
              }
              className={`${LINK_CLASS} px-2 py-1 text-xs`}
            >
              {page.label}
            </Link>
          ))}
        </div>
      ) : null}
    </nav>
  );
}
