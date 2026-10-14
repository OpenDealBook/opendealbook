import Link from 'next/link';

import type { Tables } from '@odb/supabase';
import { Badge } from '@odb/ui/badge';
import { cn } from '@odb/ui/utils';

import { LocalTime } from './local-time';
import {
  type RequestProgress,
  isWaitingOnTeam,
  statusWording,
} from './wording';

type Row = Pick<Tables<'lender_ask'>, 'id' | 'title'> &
  RequestProgress & { last_activity_at: string };

const statusTone = {
  open: 'border-brass/50 bg-brass/15 text-foreground',
  answered: 'bg-primary text-primary-foreground border-transparent',
  closed: 'bg-muted text-muted-foreground border-transparent',
  withdrawn: 'bg-muted text-muted-foreground border-transparent',
} satisfies Record<RequestProgress['status'], string>;

export function RequestStatus({
  request,
  dealName,
}: {
  request: RequestProgress;
  dealName: string | null;
}) {
  return (
    <Badge
      variant={'outline'}
      className={cn(
        'max-w-full whitespace-normal',
        request.status === 'open' && !isWaitingOnTeam(request)
          ? 'border-border bg-secondary text-secondary-foreground'
          : statusTone[request.status],
      )}
    >
      {statusWording(request, dealName)}
    </Badge>
  );
}

export function RequestList({
  rows,
  hrefFor,
  dealName,
  emptyMessage,
}: {
  rows: Row[];
  hrefFor: (id: string) => string;
  dealName: string | null;
  emptyMessage: string;
}) {
  if (rows.length === 0) {
    return <p className={'text-muted-foreground text-sm'}>{emptyMessage}</p>;
  }

  return (
    <ul className={'divide-y rounded-lg border'}>
      {rows.map((row) => (
        <li key={row.id}>
          <Link
            href={hrefFor(row.id)}
            className={
              'hover:bg-accent focus-visible:ring-ring/50 flex flex-col gap-1.5 px-4 py-3 outline-none focus-visible:ring-[3px] sm:flex-row sm:items-center sm:gap-4'
            }
          >
            <span className={'min-w-0 flex-1 font-medium sm:truncate'}>
              {row.title}
            </span>
            <span className={'flex flex-wrap items-center gap-x-3 gap-y-1'}>
              <RequestStatus request={row} dealName={dealName} />
              <span className={'text-muted-foreground text-xs'}>
                <LocalTime at={row.last_activity_at} />
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
