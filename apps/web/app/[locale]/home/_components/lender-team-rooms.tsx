'use client';

import { useState } from 'react';

import { Button } from '@odb/ui/button';

import { LenderRoomList } from './lender-room-list';
import type { TeamRoom } from './lender-team-rows';

export function LenderTeamRooms({
  teamPath,
  rows,
}: {
  teamPath: string;
  rows: (Omit<TeamRoom, 'logoPath'> & { logoUrl: string | null })[];
}) {
  const [showsAll, setShowsAll] = useState(false);
  const openRows = rows.filter((row) => row.access.kind === 'open');

  if (rows.length === 0) {
    return (
      <p className={'text-muted-foreground text-sm'}>
        No lender rooms on any deal yet. Open a deal&apos;s Lenders tab to
        create one.
      </p>
    );
  }

  return (
    <div className={'flex flex-col gap-3'}>
      <LenderRoomList
        rows={showsAll ? rows : openRows}
        hrefFor={(row) => `${teamPath}/deals/${row.dealId}/lenders/${row.id}`}
        dealLabelFor={(row) => row.dealLabel}
      />
      {showsAll || openRows.length === rows.length ? null : (
        <Button
          variant={'outline'}
          size={'sm'}
          className={'w-fit'}
          onClick={() => setShowsAll(true)}
        >
          Show closed and expired
        </Button>
      )}
    </div>
  );
}
