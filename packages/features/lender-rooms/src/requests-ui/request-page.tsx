import Link from 'next/link';

import { ArrowLeftIcon } from 'lucide-react';
import { z } from 'zod';

import type { Enums, Tables } from '@odb/supabase';
import { PageHeader } from '@odb/ui/page-header';

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
      <PageHeader
        eyebrow={
          <Link
            href={`/lender/${roomId}/requests`}
            className={
              'hover:text-foreground flex min-h-6 w-fit items-center gap-1.5'
            }
          >
            <ArrowLeftIcon className={'size-4'} />
            Requests
          </Link>
        }
        title={request.title}
        titleProps={{ id: REQUEST_TITLE_ID, tabIndex: -1 }}
        description={
          <div className={'flex flex-wrap items-center gap-x-3 gap-y-1'}>
            <RequestStatus request={progress} dealName={room.deal_name} />
            {request.return_route ? (
              <span>{returnWording(request.return_route, room.deal_name)}</span>
            ) : null}
            {signatureLine && signatureLine !== badgeWording ? (
              <span className={'text-foreground font-medium'}>
                {signatureLine}
              </span>
            ) : null}
          </div>
        }
        actions={
          canAct ? (
            <RequestActions
              roomId={roomId}
              privateFolderId={privateFolderId}
              dealName={room.deal_name}
              esignAvailable={esignAvailable}
              request={summary}
              formFile={formToComplete(thread)}
            />
          ) : null
        }
      />

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
