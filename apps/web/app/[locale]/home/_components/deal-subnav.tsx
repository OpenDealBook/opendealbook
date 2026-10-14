'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS: { segment: string; label: string }[] = [
  { segment: '', label: 'Overview' },
  { segment: 'close', label: 'Close' },
  { segment: 'operating', label: 'Operating' },
  { segment: 'worksheets', label: 'Worksheets' },
  { segment: 'hr-audit', label: 'HR audit' },
  { segment: 'workbooks', label: 'Workbooks' },
  { segment: 'schedule', label: 'Schedule' },
  { segment: 'meetings', label: 'Meetings' },
  { segment: 'todos', label: 'Todos' },
  { segment: 'lenders', label: 'Lenders' },
];

const MARKER = '/deals/';

export function DealSubnav({ showLenders = false }: { showLenders?: boolean }) {
  const pathname = usePathname();

  const markerIndex = pathname.indexOf(MARKER);
  const afterDeals = pathname.slice(markerIndex + MARKER.length);
  const [dealId = ''] = afterDeals.split('/');
  const base = pathname.slice(0, markerIndex + MARKER.length) + dealId;
  const current = afterDeals.slice(dealId.length).replace(/^\//, '');

  return (
    <nav className={'flex flex-wrap gap-1 border-b pb-2'}>
      {ITEMS.filter((item) => showLenders || item.segment !== 'lenders').map(
        (item) => {
          const active =
            item.segment === current || current.startsWith(`${item.segment}/`);
          return (
            <Link
              key={item.segment}
              href={item.segment === '' ? base : `${base}/${item.segment}`}
              aria-current={active ? 'page' : undefined}
              className={
                active
                  ? 'bg-muted text-foreground rounded-md px-3 py-1.5 text-sm font-medium'
                  : 'text-muted-foreground hover:text-foreground rounded-md px-3 py-1.5 text-sm font-medium'
              }
            >
              {item.label}
            </Link>
          );
        },
      )}
    </nav>
  );
}
