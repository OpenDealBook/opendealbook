'use client';

import { useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { draftLenderNudges } from '@odb/lender-outreach/nudges/draft-actions.ts';
import { sendLenderNudge } from '@odb/lender-outreach/nudges/send-actions.ts';
import type { LenderToNudge } from '@odb/lender-rooms/crm/nudges/nudges.ts';
import { ProblemNote } from '@odb/lender-rooms/requests-ui/refusal-note.tsx';
import { useAttempt } from '@odb/lender-rooms/requests-ui/use-attempt.ts';
import { Button } from '@odb/ui/button';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';
import { Textarea } from '@odb/ui/textarea';

import { countWording, teamSignInPath } from '../lender-wording';

type Drafted = Extract<
  Awaited<ReturnType<typeof draftLenderNudges>>,
  { ok: true }
>['value'];

function NudgeDraft({
  accountId,
  draft,
}: {
  accountId: string;
  draft: Drafted['drafts'][number];
}) {
  const router = useRouter();
  const sending = useAttempt();
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <li className={'px-4 py-3 text-sm'}>
        <span className={'font-medium'}>{draft.lenderName}</span>{' '}
        <span className={'text-muted-foreground'}>
          Nudge sent to {draft.to}
        </span>
      </li>
    );
  }

  return (
    <li className={'flex flex-col gap-3 px-4 py-4'}>
      <div className={'flex flex-wrap items-baseline justify-between gap-2'}>
        <h4 className={'font-medium'}>{draft.lenderName}</h4>
        <span className={'text-muted-foreground text-sm'}>To {draft.to}</span>
      </div>
      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={`nudge-subject-${draft.lenderId}`}>
          Subject for {draft.lenderName}
        </Label>
        <Input
          id={`nudge-subject-${draft.lenderId}`}
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
        />
      </div>
      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={`nudge-body-${draft.lenderId}`}>
          Message to {draft.lenderName}
        </Label>
        <Textarea
          id={`nudge-body-${draft.lenderId}`}
          rows={8}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
      </div>
      <ProblemNote problem={sending.problem} signInPath={teamSignInPath} />
      <Button
        className={'w-fit'}
        aria-label={`Send nudge to ${draft.lenderName}`}
        disabled={sending.isPending}
        onClick={() =>
          sending.attempt(
            () =>
              sendLenderNudge({
                accountId,
                lenderId: draft.lenderId,
                subject,
                body,
              }),
            () => {
              setSent(true);
              router.refresh();
            },
          )
        }
      >
        Send nudge
      </Button>
    </li>
  );
}

export function LendersToNudge({
  accountId,
  teamPath,
  quietDays,
  lenders,
}: {
  accountId: string;
  teamPath: string;
  quietDays: number;
  lenders: LenderToNudge[];
}) {
  const drafting = useAttempt();
  const [drafted, setDrafted] = useState<Drafted | null>(null);

  function draft() {
    drafting.attempt(
      async () => {
        const result = await draftLenderNudges({ accountId });

        if (result.ok) {
          setDrafted(result.value);
        }

        return result;
      },
      () => {},
    );
  }

  return (
    <section className={'flex flex-col gap-4'}>
      <div className={'flex flex-wrap items-end justify-between gap-4'}>
        <div className={'flex flex-col gap-1'}>
          <h2 className={'font-serif text-2xl font-medium'}>
            Lenders to nudge
          </h2>
          <p className={'text-muted-foreground text-sm'}>
            Open rooms with no word from the lender for{' '}
            {countWording(quietDays, 'day', 'days')} or more.{' '}
            <Link href={`${teamPath}/settings/lenders`} className={'underline'}>
              Change
            </Link>
          </p>
        </div>
        {lenders.length > 0 ? (
          <Button onClick={draft} disabled={drafting.isPending}>
            Draft nudges
          </Button>
        ) : null}
      </div>
      <ProblemNote problem={drafting.problem} signInPath={teamSignInPath} />
      {lenders.length === 0 ? (
        <p
          className={
            'text-muted-foreground rounded-xl border border-dashed p-6 text-sm'
          }
        >
          No lender has gone quiet.
        </p>
      ) : (
        <ul className={'bg-card divide-y rounded-xl border'}>
          {lenders.map((lender) => (
            <li
              key={lender.lenderId ?? lender.lenderName}
              className={'flex flex-col gap-2 px-4 py-3'}
            >
              <div className={'flex flex-wrap items-baseline gap-x-3'}>
                <h3 className={'font-medium'}>{lender.lenderName}</h3>
                <span className={'text-muted-foreground text-sm'}>
                  {lender.primaryContact
                    ? `${lender.primaryContact.name}${lender.primaryContact.email ? ` (${lender.primaryContact.email})` : ''}`
                    : 'No primary contact'}
                </span>
              </div>
              <ul className={'flex flex-col gap-1 text-sm'}>
                {lender.deals.map((deal) => (
                  <li key={deal.roomId} className={'flex gap-3'}>
                    <Link
                      href={`${teamPath}/deals/${deal.dealId}/lenders/${deal.roomId}`}
                      className={'hover:underline'}
                    >
                      {deal.dealName}
                    </Link>
                    <span className={'text-muted-foreground'}>
                      {countWording(deal.daysSilent, 'day', 'days')} quiet
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {drafted ? (
        <div className={'flex flex-col gap-3'}>
          <h3 className={'text-lg font-medium'}>Review and send</h3>
          {drafted.drafts.length > 0 ? (
            <ul className={'bg-card divide-y rounded-xl border'}>
              {drafted.drafts.map((nudge) => (
                <NudgeDraft
                  key={nudge.lenderId}
                  accountId={accountId}
                  draft={nudge}
                />
              ))}
            </ul>
          ) : null}
          {drafted.cannotDraft.length > 0 ? (
            <ul className={'flex flex-col gap-1 text-sm'}>
              {drafted.cannotDraft.map((row) => (
                <li key={row.lenderId ?? row.lenderName}>
                  <span className={'font-medium'}>{row.lenderName}</span>{' '}
                  <span className={'text-muted-foreground'}>{row.reason}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
