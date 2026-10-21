import Link from 'next/link';

import { counselPortalPath } from '@odb/deal-counsel/entry-rules.ts';
import { Badge } from '@odb/ui/badge';

export interface ClosedDeal {
  id: string;
  name: string;
  teamName: string;
  readUntil: string;
}

export function ClosedDeals({ deals }: { deals: ClosedDeal[] }) {
  return (
    <section className={'flex flex-col gap-3'}>
      <h2 className={'text-lg font-semibold'}>Closed deals</h2>
      <p className={'text-muted-foreground text-sm'}>
        These deals have ended. For a year after each ended you can still read
        your messages with your client and your documents, but nothing can be
        changed.
      </p>
      <ul className={'flex flex-col divide-y rounded-lg border'}>
        {deals.map((deal) => (
          <li key={deal.id} className={'flex items-center gap-3 p-3'}>
            <Link
              href={`${counselPortalPath(deal.id)}/client`}
              className={'font-medium hover:underline'}
            >
              {deal.name}
            </Link>
            <span className={'text-muted-foreground text-sm'}>
              {deal.teamName}
            </span>
            <Badge variant={'secondary'} className={'ml-auto'}>
              Read-only until{' '}
              {new Date(deal.readUntil).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                timeZone: 'UTC',
              })}
            </Badge>
          </li>
        ))}
      </ul>
    </section>
  );
}
