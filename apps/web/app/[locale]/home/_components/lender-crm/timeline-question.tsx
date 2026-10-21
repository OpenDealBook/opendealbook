'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { longDate } from '@odb/lender-outreach/draft-email.ts';
import { ProblemNote } from '@odb/lender-rooms/requests-ui/refusal-note.tsx';
import { useAttempt } from '@odb/lender-rooms/requests-ui/use-attempt.ts';
import { answerTimeline } from '@odb/lender-rooms/timeline-answer/lender-actions.ts';
import type { Enums } from '@odb/supabase';
import { Button } from '@odb/ui/button';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';
import { Textarea } from '@odb/ui/textarea';

import { TIMELINE_ANSWERS } from './timeline-wording';

type Answer = Enums<'lender_timeline_answer'>;

export interface StoredTimelineAnswer {
  answer: Answer;
  note: string | null;
  earliest_close_date: string | null;
}

export function TimelineQuestion({
  roomId,
  teamName,
  closeBy,
  reason,
  stored,
}: {
  roomId: string;
  teamName: string;
  closeBy: string;
  reason: string | null;
  stored: StoredTimelineAnswer | null;
}) {
  const router = useRouter();
  const answering = useAttempt();
  const [note, setNote] = useState(stored?.note ?? '');
  const [earliestCloseDate, setEarliestCloseDate] = useState(
    stored?.earliest_close_date ?? '',
  );
  const [told, setTold] = useState(false);

  const send = (answer: Answer) =>
    answering.attempt(
      () =>
        answerTimeline({
          roomId,
          answer,
          note: note.trim() || null,
          earliestCloseDate:
            answer === 'no' ? earliestCloseDate || null : null,
        }),
      () => {
        setTold(true);
        router.refresh();
      },
    );

  return (
    <section
      aria-labelledby={'timeline-question'}
      className={
        'border-primary/30 bg-primary/5 flex flex-col gap-4 rounded-xl border p-5'
      }
    >
      <div className={'flex flex-col gap-1'}>
        <h2 id={'timeline-question'} className={'text-lg font-semibold'}>
          Can you close by {longDate(closeBy)}?
        </h2>
        {reason ? <p className={'text-muted-foreground'}>{reason}</p> : null}
      </div>
      <div className={'flex flex-wrap gap-2'}>
        {(Object.keys(TIMELINE_ANSWERS) as Answer[]).map((choice) => (
          <Button
            key={choice}
            variant={stored?.answer === choice ? 'default' : 'outline'}
            aria-pressed={stored?.answer === choice}
            disabled={answering.isPending}
            onClick={() => send(choice)}
          >
            {TIMELINE_ANSWERS[choice]}
          </Button>
        ))}
      </div>
      {stored ? (
        <form
          className={'flex max-w-xl flex-col gap-3'}
          onSubmit={(event) => {
            event.preventDefault();
            send(stored.answer);
          }}
        >
          {stored.answer === 'no' ? (
            <div className={'flex flex-col gap-1.5'}>
              <Label htmlFor={'earliest-close-date'}>
                Earliest date you can close
              </Label>
              <Input
                id={'earliest-close-date'}
                type={'date'}
                className={'w-fit'}
                value={earliestCloseDate}
                onChange={(event) => setEarliestCloseDate(event.target.value)}
              />
            </div>
          ) : null}
          <div className={'flex flex-col gap-1.5'}>
            <Label htmlFor={'timeline-note'}>Note (optional)</Label>
            <Textarea
              id={'timeline-note'}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          <Button
            type={'submit'}
            variant={'outline'}
            className={'w-fit'}
            disabled={answering.isPending}
          >
            Save
          </Button>
        </form>
      ) : null}
      {told ? (
        <p role={'status'} className={'text-sm'}>
          We&apos;ve let {teamName} know.
        </p>
      ) : null}
      <ProblemNote problem={answering.problem} />
    </section>
  );
}
