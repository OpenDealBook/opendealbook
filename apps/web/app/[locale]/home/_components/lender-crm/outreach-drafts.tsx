'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { draftLenderOutreach } from '@odb/lender-outreach/draft-actions.ts';
import { longDate } from '@odb/lender-outreach/draft-email.ts';
import { sendLenderOutreach } from '@odb/lender-outreach/send-actions.ts';
import { ProblemNote } from '@odb/lender-rooms/requests-ui/refusal-note.tsx';
import { useAttempt } from '@odb/lender-rooms/requests-ui/use-attempt.ts';
import { Button } from '@odb/ui/button';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';
import { Textarea } from '@odb/ui/textarea';

import { teamSignInPath } from '../lender-wording';

type Drafted = Extract<
  Awaited<ReturnType<typeof draftLenderOutreach>>,
  { ok: true }
>['value'];

function OutreachDraft({ draft }: { draft: Drafted['drafts'][number] }) {
  const router = useRouter();
  const sending = useAttempt();
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [sent, setSent] = useState(false);
  const isResend = draft.lastSentAt !== null;

  if (sent) {
    return (
      <li className={'px-4 py-3 text-sm'}>
        <span className={'font-medium'}>{draft.lenderName}</span>{' '}
        <span className={'text-muted-foreground'}>Sent to {draft.to}</span>
      </li>
    );
  }

  return (
    <li className={'flex flex-col gap-3 px-4 py-4'}>
      <div className={'flex flex-wrap items-baseline justify-between gap-2'}>
        <h4 className={'font-medium'}>{draft.lenderName}</h4>
        <span className={'text-muted-foreground text-sm'}>To {draft.to}</span>
      </div>
      {draft.lastSentAt !== null ? (
        <p
          className={'bg-warning/10 text-warning rounded-md px-3 py-2 text-sm'}
        >
          Already sent on {longDate(draft.lastSentAt.slice(0, 10))}. Sending
          again emails this lender a second time.
        </p>
      ) : null}
      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={`outreach-subject-${draft.roomId}`}>
          Subject for {draft.lenderName}
        </Label>
        <Input
          id={`outreach-subject-${draft.roomId}`}
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
        />
      </div>
      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={`outreach-body-${draft.roomId}`}>
          Message to {draft.lenderName}
        </Label>
        <Textarea
          id={`outreach-body-${draft.roomId}`}
          rows={14}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
      </div>
      <ProblemNote problem={sending.problem} signInPath={teamSignInPath} />
      <Button
        className={'w-fit'}
        variant={isResend ? 'outline' : 'default'}
        aria-label={`${isResend ? 'Send again' : 'Send'} to ${draft.lenderName}`}
        disabled={sending.isPending}
        onClick={() =>
          sending.attempt(
            () =>
              sendLenderOutreach({
                roomId: draft.roomId,
                subject,
                body,
                confirmResend: isResend,
              }),
            () => {
              setSent(true);
              router.refresh();
            },
          )
        }
      >
        {isResend ? 'Send again' : 'Send'}
      </Button>
    </li>
  );
}

export function OutreachDrafts({ dealId }: { dealId: string }) {
  const drafting = useAttempt();
  const [drafted, setDrafted] = useState<Drafted | null>(null);

  return (
    <div className={'flex flex-col gap-3'}>
      <Button
        className={'w-fit'}
        disabled={drafting.isPending}
        onClick={() =>
          drafting.attempt(
            async () => {
              const result = await draftLenderOutreach({ dealId });

              if (result.ok) {
                setDrafted(result.value);
              }

              return result;
            },
            () => {},
          )
        }
      >
        Draft outreach
      </Button>
      <ProblemNote problem={drafting.problem} signInPath={teamSignInPath} />
      {drafted && drafted.drafts.length > 0 ? (
        <ul className={'bg-card divide-y rounded-xl border'}>
          {drafted.drafts.map((draft) => (
            <OutreachDraft key={draft.roomId} draft={draft} />
          ))}
        </ul>
      ) : null}
      {drafted && drafted.skipped.length > 0 ? (
        <ul className={'flex flex-col gap-1 text-sm'}>
          {drafted.skipped.map((row) => (
            <li key={row.roomId}>
              <span className={'font-medium'}>{row.roomName}</span>{' '}
              <span className={'text-muted-foreground'}>{row.reason}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
