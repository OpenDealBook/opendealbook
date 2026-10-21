import Link from 'next/link';

import { ArrowLeftIcon } from 'lucide-react';
import { z } from 'zod';

import type { LenderRoomSummary } from '../members/entry-rules';
import { AskComposerForm, SendingRequests, SendingRows } from './ask-composer';
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
  contactName,
}: {
  room: LenderRoomSummary;
  canAct: boolean;
  contactName: string | null;
  esignAvailable: boolean;
} & Awaited<ReturnType<typeof loadRequests>>) {
  const roomId = z.uuid().parse(room.id);
  const privateFolderId = z.uuid().parse(room.private_folder_id);

  return (
    <SendingRequests sentTo={contactName ?? teamName(room.deal_name)}>
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
            {room.deal_name}
          </Link>
          <div
            className={'flex flex-wrap items-baseline justify-between gap-3'}
          >
            <h1 className={'font-serif text-3xl font-medium'}>Requests</h1>
            <Link
              href={`/lender/${roomId}/faq`}
              className={
                'text-muted-foreground hover:text-foreground min-h-6 text-sm underline-offset-4 hover:underline'
              }
            >
              Check the FAQ
            </Link>
          </div>
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
          <SendingRows
            kind={'ask'}
            shownIds={asks.map((ask) => ask.id)}
            emptyMessage={
              'No requests yet. Type what you need in the box above and send it.'
            }
          />
          <RequestList
            rows={asks}
            hrefFor={(askId) => `/lender/${roomId}/requests/asks/${askId}`}
            dealName={room.deal_name}
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
          <SendingRows
            kind={'form'}
            shownIds={forms.map((form) => form.id)}
            emptyMessage={`No forms yet. Upload one of your own forms for ${teamName(room.deal_name)} to complete.`}
          />
          <RequestList
            rows={forms}
            hrefFor={(formId) => `/lender/${roomId}/requests/forms/${formId}`}
            dealName={room.deal_name}
          />
        </section>
      </main>
    </SendingRequests>
  );
}
