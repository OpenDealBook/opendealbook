'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { counselPortalPath } from '@odb/deal-counsel/entry-rules.ts';
import type { CounselSide } from '@odb/deal-counsel/portal-gate.ts';

export function CounselNav({
  dealId,
  sides,
  readOnly = false,
}: {
  dealId: string;
  sides: CounselSide[];
  readOnly?: boolean;
}) {
  const pathname = usePathname();
  const portal = counselPortalPath(dealId);
  const tabs = readOnly
    ? [{ href: `${portal}/client`, label: 'Your client' }]
    : [
        { href: portal, label: 'Overview' },
        { href: `${portal}/contracts`, label: 'Contracts' },
        { href: `${portal}/messages`, label: 'Messages' },
        ...(sides.includes('buyer')
          ? [
              { href: `${portal}/data-room`, label: 'Data room' },
              { href: `${portal}/questions`, label: 'Seller questions' },
            ]
          : []),
        ...(sides.includes('seller')
          ? [
              { href: `${portal}/seller-room`, label: 'Seller room' },
              { href: `${portal}/client`, label: 'Your client' },
            ]
          : []),
      ];

  return (
    <nav aria-label={'Deal pages'} className={'-mb-px flex flex-wrap gap-1'}>
      {tabs.map((tab) => {
        const active =
          tab.href === portal
            ? pathname.endsWith(portal)
            : pathname.includes(tab.href);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={
              active
                ? 'border-primary text-foreground border-b-2 px-3 py-2 text-sm font-medium'
                : 'text-muted-foreground hover:text-foreground border-b-2 border-transparent px-3 py-2 text-sm font-medium'
            }
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
