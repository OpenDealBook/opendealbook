'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function LenderSubnav({
  items,
}: {
  items: { label: string; href: string }[];
}) {
  const pathname = usePathname();

  return (
    <nav className={'flex gap-1 border-b pb-2'}>
      {items.map((item) => {
        const active = pathname.endsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
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
      })}
    </nav>
  );
}

export function LenderTeamSubnav({ basePath }: { basePath: string }) {
  return (
    <LenderSubnav
      items={[
        { label: 'Rooms', href: basePath },
        { label: 'Saved lenders', href: `${basePath}/saved` },
        { label: 'Contacts', href: `${basePath}/contacts` },
      ]}
    />
  );
}
