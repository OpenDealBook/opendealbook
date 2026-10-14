import Link from 'next/link';

import type { RoomActivityEntry } from '@odb/lender-rooms/activity/queries.ts';
import { LocalTime } from '@odb/lender-rooms/requests-ui/local-time.tsx';
import { Badge } from '@odb/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@odb/ui/table';

import { LenderFileLink } from './lender-file-link';
import { personLabel } from './lender-wording';

const recordedWording = {
  room_opened: 'Opened the room',
  folder_opened: 'Opened folder',
  document_previewed: 'Previewed',
  document_downloaded: 'Downloaded',
  zip_downloaded: 'Downloaded a zip',
  folder_created: 'Created folder',
} satisfies Record<
  Extract<RoomActivityEntry, { kind: 'recorded' }>['action'],
  string
>;

const threadWording = {
  request_opened: 'Opened a request',
  form_uploaded: 'Uploaded a form',
  reply: 'Replied',
};

const threadFileWording = {
  attachment: 'Attached a file',
  fulfilment: 'Sent a file',
  blank_form: 'Uploaded a form to complete',
  completed_form: 'Returned a completed form',
  signed_form: 'Filed the signed form',
} satisfies Record<
  Extract<RoomActivityEntry, { kind: 'thread_file' }>['role'],
  string
>;

const threadSegment = { ask: 'asks', form: 'forms' };

function ThreadLink({
  roomPath,
  thread,
}: {
  roomPath: string;
  thread: Extract<RoomActivityEntry, { askId: string }>;
}) {
  return (
    <Link
      className={'font-medium underline'}
      href={`${roomPath}/requests/${threadSegment[thread.askKind]}/${thread.askId}`}
    >
      {thread.askTitle}
    </Link>
  );
}

function what(
  entry: RoomActivityEntry,
  roomId: string,
  roomPath: string,
): { action: string; item: React.ReactNode } {
  switch (entry.kind) {
    case 'recorded':
      return {
        action: recordedWording[entry.action],
        item: entry.documentName ?? entry.folderName,
      };
    case 'request_opened':
    case 'form_uploaded':
    case 'reply':
      return {
        action: threadWording[entry.kind],
        item: <ThreadLink roomPath={roomPath} thread={entry} />,
      };
    case 'thread_file':
      return {
        action: threadFileWording[entry.role],
        item: (
          <span className={'flex flex-wrap items-baseline gap-x-2'}>
            {entry.documentName ? (
              <LenderFileLink
                source={{ roomId: roomId }}
                documentId={entry.documentId}
                fileName={entry.documentName}
                downloadLabel={`Download ${entry.documentName}`}
              />
            ) : null}
            <span className={'text-muted-foreground'}>on</span>
            <ThreadLink roomPath={roomPath} thread={entry} />
          </span>
        ),
      };
    case 'file_uploaded':
      return {
        action: 'Uploaded a file',
        item: (
          <span className={'flex flex-wrap items-baseline gap-x-2'}>
            <LenderFileLink
              source={{ roomId: roomId }}
              documentId={entry.documentId}
              fileName={entry.documentName}
              downloadLabel={`Download ${entry.documentName}`}
            />
          </span>
        ),
      };
  }
}

export function LenderRoomActivity({
  roomId,
  roomPath,
  entries,
}: {
  roomId: string;
  roomPath: string;
  entries: RoomActivityEntry[];
}) {
  if (entries.length === 0) {
    return (
      <p className={'text-muted-foreground text-sm'}>
        Nothing has happened in this room yet. Opens, previews, downloads,
        requests, and uploads show up here.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Person</TableHead>
          <TableHead>Action</TableHead>
          <TableHead>File, folder, or request</TableHead>
          <TableHead>When</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => {
          const { action, item } = what(entry, roomId, roomPath);

          return (
            <TableRow key={`${entry.kind}:${entry.id}`}>
              <TableCell>
                <span className={'flex items-center gap-2'}>
                  {entry.email === null
                    ? 'Filed automatically'
                    : `${personLabel({ name: entry.name, email: entry.email })}${entry.isRemoved ? ' (removed)' : ''}`}
                  {entry.side === 'internal' ? (
                    <Badge variant={'outline'}>Internal</Badge>
                  ) : null}
                </span>
              </TableCell>
              <TableCell>{action}</TableCell>
              <TableCell>{item}</TableCell>
              <TableCell className={'text-muted-foreground'}>
                <LocalTime at={entry.at} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
