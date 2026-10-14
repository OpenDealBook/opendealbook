import Link from 'next/link';

import { LocalTime } from '@odb/lender-rooms/requests-ui/local-time.tsx';
import {
  type RequestProgress,
  isWaitingOnTeam,
} from '@odb/lender-rooms/requests-ui/wording.ts';

import { RequestBadges } from './lender-request-badges';
import { signatureStatusWording } from './signature-wording';

export interface InboxRow extends RequestProgress {
  id: string;
  title: string;
  last_activity_at: string;
}

export interface InboxForm extends InboxRow {
  completed_document_ids: string[];
}

function formProgress(form: InboxForm): string | null {
  if (form.return_route === 'esign') {
    return (
      form.latest_signature_status &&
      signatureStatusWording[form.latest_signature_status]
    );
  }

  return form.completed_document_ids.length > 0
    ? 'Completed file returned'
    : null;
}

export function LenderRequestInbox({
  roomPath,
  asks,
  forms,
}: {
  roomPath: string;
  asks: InboxRow[];
  forms: InboxForm[];
}) {
  const rows = [
    ...asks.map((ask) => ({
      request: ask,
      segment: 'asks',
      isForm: false,
      progress: null,
    })),
    ...forms.map((form) => ({
      request: form,
      segment: 'forms',
      isForm: true,
      progress: formProgress(form),
    })),
  ].toSorted(
    (a, b) =>
      Number(isWaitingOnTeam(b.request)) - Number(isWaitingOnTeam(a.request)) ||
      b.request.last_activity_at.localeCompare(a.request.last_activity_at),
  );

  if (rows.length === 0) {
    return (
      <p className={'text-muted-foreground text-sm'}>
        This lender has not sent any requests yet. Questions and forms they send
        show up here.
      </p>
    );
  }

  return (
    <ul className={'bg-card divide-y rounded-lg border'}>
      {rows.map(({ request, segment, isForm, progress }) => (
        <li key={request.id}>
          <Link
            href={`${roomPath}/requests/${segment}/${request.id}`}
            className={
              'hover:bg-accent focus-visible:ring-ring/50 flex flex-col gap-1.5 px-4 py-3 outline-none focus-visible:ring-[3px] sm:flex-row sm:items-center sm:gap-4'
            }
          >
            <span className={'min-w-0 flex-1 font-medium sm:truncate'}>
              {request.title}
            </span>
            <span className={'flex flex-wrap items-center gap-x-3 gap-y-1'}>
              <RequestBadges isForm={isForm} request={request} />
              {progress ? <span className={'text-sm'}>{progress}</span> : null}
              <span className={'text-muted-foreground text-xs'}>
                <LocalTime at={request.last_activity_at} />
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
