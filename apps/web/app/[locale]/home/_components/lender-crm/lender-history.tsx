import Link from 'next/link';

import type { LenderHistoryRow } from '@odb/lender-rooms/crm/history/lender-history.ts';
import { LocalTime } from '@odb/lender-rooms/requests-ui/local-time.tsx';

import { RoomStatusBadge } from '../lender-room-access';
import { countWording } from '../lender-wording';

export function LenderHistory({
  rows,
  teamPath,
}: {
  rows: LenderHistoryRow[];
  teamPath: string;
}) {
  if (rows.length === 0) {
    return (
      <p className={'text-muted-foreground text-sm'}>
        No deal rooms with this lender yet.
      </p>
    );
  }

  return (
    <ul className={'divide-y rounded-lg border text-sm'}>
      {rows.map((row) => (
        <li
          key={row.room_id}
          className={'flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2'}
        >
          <Link
            href={`${teamPath}/deals/${row.deal_id}/lenders/${row.room_id}`}
            className={'min-w-0 flex-1 truncate font-medium hover:underline'}
          >
            {row.deal_name}
          </Link>
          <RoomStatusBadge status={row.status} />
          <span className={'text-muted-foreground'}>
            {countWording(row.asks_count, 'ask', 'asks')}
          </span>
          <span className={'text-muted-foreground'}>
            Opened <LocalTime at={row.room_created_at} />
          </span>
        </li>
      ))}
    </ul>
  );
}
