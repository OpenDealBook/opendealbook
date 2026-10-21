'use client';

import { useState } from 'react';

import { LocalTime } from '@odb/lender-rooms/requests-ui/local-time.tsx';
import type {
  SellerRoomActivityEntry,
  SellerRoomActivityItem,
} from '@odb/seller-rooms/activity/queries.ts';
import { Badge } from '@odb/ui/badge';
import { Button } from '@odb/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@odb/ui/table';

import { DataRoomDocumentLink } from './data-room-document-link';
import { personLabel } from './lender-wording';

const SHOWN_AT_FIRST = 200;

const actionWording = {
  room_opened: 'Opened the room',
  folder_opened: 'Opened folder',
  document_previewed: 'Previewed',
  document_downloaded: 'Downloaded',
  zip_downloaded: 'Downloaded a zip',
  document_uploaded: 'Uploaded a file',
  meeting_opened: 'Opened a meeting',
  question_answered: 'Answered a question',
  folder_created: 'Created folder',
} satisfies Record<SellerRoomActivityEntry['action'], string>;

function Item({
  dealId,
  item,
}: {
  dealId: string;
  item: SellerRoomActivityItem;
}) {
  switch (item.kind) {
    case 'file':
      return item.isRemoved ? (
        `${item.name} (removed)`
      ) : (
        <span className={'flex flex-wrap items-center gap-2'}>
          {item.name}
          <DataRoomDocumentLink dealId={dealId} documentId={item.documentId} />
        </span>
      );
    case 'question':
      return (
        <a
          className={'font-medium underline'}
          href={`#seller-question-${item.questionId}`}
        >
          {item.title}
        </a>
      );
    case 'zip':
      return `${item.fileCount} files`;
    case 'folder':
    case 'meeting':
    case 'sent':
      return item.name;
  }
}

function personWording(person: SellerRoomActivityEntry['person']): string {
  const label = person.email
    ? personLabel({ name: person.name, email: person.email })
    : 'Former teammate';

  return person.isRemoved ? `${label} (removed)` : label;
}

export function SellerRoomActivity({
  dealId,
  entries,
}: {
  dealId: string;
  entries: SellerRoomActivityEntry[];
}) {
  const [showAll, setShowAll] = useState(false);

  if (entries.length === 0) {
    return (
      <p className={'text-muted-foreground text-sm'}>
        Nothing has happened in this room yet. Opens, previews, downloads,
        uploads, and answers show up here.
      </p>
    );
  }

  const shown = showAll ? entries : entries.slice(0, SHOWN_AT_FIRST);

  return (
    <div className={'flex flex-col gap-2'}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Person</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>File, folder, meeting, or question</TableHead>
            <TableHead>When</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell>
                <span className={'flex items-center gap-2'}>
                  {personWording(entry.person)}
                  {entry.side === 'internal' ? (
                    <Badge variant={'outline'}>Internal</Badge>
                  ) : null}
                </span>
              </TableCell>
              <TableCell>{actionWording[entry.action]}</TableCell>
              <TableCell>
                {entry.item ? <Item dealId={dealId} item={entry.item} /> : null}
              </TableCell>
              <TableCell className={'text-muted-foreground'}>
                <LocalTime at={entry.at} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {shown.length < entries.length ? (
        <div>
          <Button
            type={'button'}
            variant={'outline'}
            size={'sm'}
            onClick={() => setShowAll(true)}
          >
            {`Show all ${entries.length}`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
