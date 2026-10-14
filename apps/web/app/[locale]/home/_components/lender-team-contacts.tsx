'use client';

import { useState } from 'react';

import Link from 'next/link';

import { LocalTime } from '@odb/lender-rooms/requests-ui/local-time.tsx';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@odb/ui/table';

import { LenderMark } from './lender-mark';
import { RoomStatusBadge } from './lender-room-access';
import {
  type TeamContact,
  filterContacts,
  initialsOf,
} from './lender-team-rows';
import {
  countWording,
  personLabel,
  waitingOnLenderWording,
  waitingOnUsWording,
} from './lender-wording';

type ContactRow = Omit<TeamContact, 'logoPath'> & { logoUrl: string | null };

export function LenderTeamContacts({
  teamPath,
  rows,
}: {
  teamPath: string;
  rows: ContactRow[];
}) {
  const [filter, setFilter] = useState('');
  const shown = filterContacts(rows, filter);

  if (rows.length === 0) {
    return (
      <p className={'text-muted-foreground text-sm'}>
        No lender people yet. Invite people from a lender room&apos;s People
        tab.
      </p>
    );
  }

  return (
    <div className={'flex flex-col gap-4'}>
      <div className={'flex max-w-sm flex-col gap-2'}>
        <Label htmlFor={'lender-contacts-filter'}>Filter people</Label>
        <Input
          id={'lender-contacts-filter'}
          value={filter}
          placeholder={'Name, email, institution or deal'}
          onChange={(event) => setFilter(event.target.value)}
        />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Person</TableHead>
            <TableHead>Room and deal</TableHead>
            <TableHead>Visits</TableHead>
            <TableHead>Files</TableHead>
            <TableHead>Their requests</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((row) => (
            <TableRow key={`${row.roomId}:${row.userId}`}>
              <TableCell className={'align-top'}>
                <div className={'flex flex-col gap-0.5'}>
                  <span className={'font-medium'}>{personLabel(row)}</span>
                  <span className={'text-muted-foreground text-xs'}>
                    {row.hasSignedIn ? 'Signed in' : 'Not signed in yet'}
                  </span>
                  <span className={'text-muted-foreground text-xs'}>
                    {row.invitedBy
                      ? `Invited by ${row.invitedBy} on `
                      : 'Invited '}
                    <LocalTime at={row.invitedAt} />
                  </span>
                  {row.removedAt ? (
                    <span className={'text-muted-foreground text-xs'}>
                      Removed <LocalTime at={row.removedAt} />
                    </span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className={'align-top'}>
                <div className={'flex items-start gap-3'}>
                  <LenderMark
                    name={row.institution}
                    initials={initialsOf(row.institution)}
                    logoUrl={row.logoUrl}
                    className={'size-8 text-xs'}
                  />
                  <div className={'flex flex-col gap-1'}>
                    <Link
                      href={`${teamPath}/deals/${row.dealId}/lenders/${row.roomId}?tab=people`}
                      className={'font-medium hover:underline'}
                    >
                      {row.roomName}
                    </Link>
                    {row.dealLabel ? (
                      <span className={'text-muted-foreground text-xs'}>
                        {row.dealLabel}
                      </span>
                    ) : null}
                    <span>
                      <RoomStatusBadge status={row.roomStatus} />
                    </span>
                  </div>
                </div>
              </TableCell>
              <TableCell className={'text-muted-foreground align-top text-xs'}>
                {row.firstVisitAt ? (
                  <div>
                    First visit <LocalTime at={row.firstVisitAt} />
                  </div>
                ) : (
                  <div>No visits yet</div>
                )}
                {row.lastVisitAt ? (
                  <div>
                    Last visit <LocalTime at={row.lastVisitAt} />
                  </div>
                ) : null}
              </TableCell>
              <TableCell className={'text-muted-foreground align-top text-xs'}>
                <div>
                  {countWording(row.filesViewed, 'file viewed', 'files viewed')}
                </div>
                <div>
                  {countWording(row.downloads, 'download', 'downloads')}
                </div>
              </TableCell>
              <TableCell className={'text-muted-foreground align-top text-xs'}>
                <div>
                  {countWording(
                    row.requestsOpened,
                    'request opened',
                    'requests opened',
                  )}
                </div>
                <div>{waitingOnUsWording(row.waitingOnTeam)}</div>
                <div>{waitingOnLenderWording(row.waitingOnLender)}</div>
                <div>
                  {countWording(
                    row.formsOutForSignature,
                    'form out for signature',
                    'forms out for signature',
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {shown.length === 0 ? (
        <p className={'text-muted-foreground text-sm'}>
          No people match &quot;{filter}&quot;
        </p>
      ) : null}
    </div>
  );
}
