import Link from 'next/link';

import { LocalTime } from '@odb/lender-rooms/requests-ui/local-time.tsx';
import type { Enums } from '@odb/supabase';

import { LenderMark } from './lender-mark';
import { RoomAccessWording, RoomStatusBadge } from './lender-room-access';
import type { RoomAccess } from './lender-room-order';
import { countWording, waitingOnUsWording } from './lender-wording';

export interface LenderRoomRow {
  id: string;
  name: string;
  initials: string;
  logoUrl: string | null;
  status: Enums<'lender_room_status'>;
  access: RoomAccess;
  peopleCount: number;
  waitingOnUs: number;
  lastActivityAt: string | null;
}

export function LenderRoomList<Row extends LenderRoomRow>({
  rows,
  hrefFor,
  dealLabelFor,
}: {
  rows: Row[];
  hrefFor: (row: Row) => string;
  dealLabelFor?: (row: Row) => string | null;
}) {
  return (
    <ul className={'bg-card divide-y rounded-xl border'}>
      {rows.map((row) => (
        <li
          key={row.id}
          className={
            'grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 px-4 py-3 lg:grid-cols-[auto_minmax(12rem,1.4fr)_7rem_minmax(13rem,1.2fr)_5.5rem_minmax(10rem,1fr)_minmax(11rem,1fr)]'
          }
        >
          <LenderMark {...row} />
          <div className={'flex min-w-0 flex-col'}>
            <Link
              href={hrefFor(row)}
              className={
                'focus-visible:ring-ring/50 min-w-0 truncate rounded-sm font-medium outline-none hover:underline focus-visible:ring-[3px]'
              }
            >
              {row.name}
            </Link>
            {dealLabelFor ? (
              <span className={'text-muted-foreground truncate text-sm'}>
                {dealLabelFor(row)}
              </span>
            ) : null}
          </div>
          <div
            className={
              'col-span-2 grid grid-cols-2 items-center gap-x-4 gap-y-1 text-sm sm:grid-cols-3 lg:contents'
            }
          >
            <span>
              <RoomStatusBadge status={row.status} />
            </span>
            <RoomAccessWording access={row.access} />
            <span className={'text-muted-foreground'}>
              {countWording(row.peopleCount, 'person', 'people')}
            </span>
            <span
              className={
                row.waitingOnUs > 0 ? 'font-medium' : 'text-muted-foreground'
              }
            >
              {waitingOnUsWording(row.waitingOnUs)}
            </span>
            <span className={'text-muted-foreground'}>
              {row.lastActivityAt ? (
                <>
                  Last lender activity <LocalTime at={row.lastActivityAt} />
                </>
              ) : (
                'No lender activity yet'
              )}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
