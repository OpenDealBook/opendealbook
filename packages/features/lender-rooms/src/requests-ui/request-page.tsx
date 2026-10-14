import Link from 'next/link';

import { ArrowLeftIcon } from 'lucide-react';
import { z } from 'zod';

import type { Enums, Tables } from '@odb/supabase';

import type { LenderRoomSummary } from '../members/entry-rules';
import { RequestStatus } from './request-list';
import {
  REQUEST_TITLE_ID,
  RequestActions,
  RequestThread,
} from './request-thread';
import { type ThreadEntry, formToComplete } from './thread';
import { ViewingAsLender } from './viewing-as-lender';
import { returnWording, signatureWording, statusWording } from './wording';

export function RequestPage({
  room,
  request,
  thread,
  signatureStatus,
  canAct,
  esignAvailable,
}: {
  room: LenderRoomSummary;
  request: Tables<'lender_ask'>;
  thread: ThreadEntry[];
  signatureStatus?: Enums<'lender_signature_status'>;
  canAct: boolean;
  esignAvailable: boolean;
}) {
  const roomId = z.uuid().parse(room.id);
  const privateFolderId = z.uuid().parse(room.private_folder_id);
  const { kind, id, title, body, status, first_response_at, return_route } =
    request;
  const summary = {
    kind,
    id,
    title,
    body,
    status,
    first_response_at,
    return_route,
  };

  const progress = {
    ...summary,
    latest_signature_status: signatureStatus ?? null,
  };
  const badgeWording = statusWording(progress, room.deal_name);
  const signatureLine = signatureStatus
    ? signatureWording[signatureStatus]
    : null;

  return (
    <main className={'flex flex-col gap-6'}>
      {canAct ? null : <ViewingAsLender lenderName={room.name} />}
      <header className={'flex flex-col gap-3'}>
        <Link
          href={`/lender/${roomId}/requests`}
          className={
            'text-muted-foreground hover:text-foreground flex min-h-6 w-fit items-center gap-1.5 text-sm'
          }
        >
          <ArrowLeftIcon className={'size-4'} />
          Requests
        </Link>
        <div
          className={
            'flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'
          }
        >
          <div className={'flex min-w-0 flex-col gap-2'}>
            <h1
              id={REQUEST_TITLE_ID}
              tabIndex={-1}
              className={
                'font-serif text-2xl font-medium break-words outline-none sm:text-3xl'
              }
            >
              {request.title}
            </h1>
            <div
              className={'flex flex-wrap items-center gap-x-3 gap-y-1 text-sm'}
            >
              <RequestStatus request={progress} dealName={room.deal_name} />
              {request.return_route ? (
                <span className={'text-muted-foreground'}>
                  {returnWording(request.return_route, room.deal_name)}
                </span>
              ) : null}
              {signatureLine && signatureLine !== badgeWording ? (
                <span className={'font-medium'}>{signatureLine}</span>
              ) : null}
            </div>
          </div>
          {canAct ? (
            <RequestActions
              roomId={roomId}
              privateFolderId={privateFolderId}
              dealName={room.deal_name}
              esignAvailable={esignAvailable}
              request={summary}
              formFile={formToComplete(thread)}
            />
          ) : null}
        </div>
      </header>

      <RequestThread
        roomId={roomId}
        privateFolderId={privateFolderId}
        lenderName={z.string().parse(room.name)}
        dealName={room.deal_name}
        request={summary}
        thread={thread}
        canAct={canAct}
      />
    </main>
  );
}
