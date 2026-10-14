import Link from 'next/link';

import { ArrowLeftIcon } from 'lucide-react';
import { z } from 'zod';

import type { LenderRoomSummary } from '../members/entry-rules';
import { AskComposerForm } from './ask-composer';
import { FormUpload } from './form-upload';
import type { loadRequests } from './load-requests';
import { RequestList } from './request-list';
import { ViewingAsLender } from './viewing-as-lender';
import { teamName } from './wording';

export function RequestsPage({
  room,
  asks,
  forms,
  canAct,
  esignAvailable,
}: {
  room: LenderRoomSummary;
  canAct: boolean;
  esignAvailable: boolean;
} & Awaited<ReturnType<typeof loadRequests>>) {
  const roomId = z.uuid().parse(room.id);
  const privateFolderId = z.uuid().parse(room.private_folder_id);

  return (
    <main className={'flex flex-col gap-8'}>
      {canAct ? null : <ViewingAsLender lenderName={room.name} />}
      <header className={'flex flex-col gap-3'}>
        <Link
          href={`/lender/${roomId}`}
          className={
            'text-muted-foreground hover:text-foreground flex min-h-6 w-fit items-center gap-1.5 text-sm'
          }
        >
          <ArrowLeftIcon className={'size-4'} />
          {room.name}
        </Link>
        <h1 className={'font-serif text-3xl font-medium'}>Requests</h1>
        {canAct ? (
          <AskComposerForm
            roomId={roomId}
            privateFolderId={privateFolderId}
            dealName={room.deal_name}
          />
        ) : null}
      </header>

      <section
        className={'flex flex-col gap-3'}
        aria-labelledby={'information-heading'}
      >
        <h2 id={'information-heading'} className={'text-lg font-semibold'}>
          Information requests
        </h2>
        <RequestList
          rows={asks}
          hrefFor={(askId) => `/lender/${roomId}/requests/asks/${askId}`}
          dealName={room.deal_name}
          emptyMessage={
            'No requests yet. Type what you need in the box above and send it.'
          }
        />
      </section>

      <section
        className={'flex flex-col gap-3'}
        aria-labelledby={'forms-heading'}
      >
        <div className={'flex items-center justify-between gap-3'}>
          <h2 id={'forms-heading'} className={'text-lg font-semibold'}>
            Forms
          </h2>
          {canAct ? (
            <FormUpload
              roomId={roomId}
              privateFolderId={privateFolderId}
              dealName={room.deal_name}
              esignAvailable={esignAvailable}
            />
          ) : null}
        </div>
        <RequestList
          rows={forms}
          hrefFor={(formId) => `/lender/${roomId}/requests/forms/${formId}`}
          dealName={room.deal_name}
          emptyMessage={`No forms yet. Upload one of your own forms for ${teamName(room.deal_name)} to complete.`}
        />
      </section>
    </main>
  );
}
