'use client';

import { useRouter } from 'next/navigation';

import { longDate } from '@odb/lender-outreach/draft-email.ts';
import { ProblemNote } from '@odb/lender-rooms/requests-ui/refusal-note.tsx';
import { useAttempt } from '@odb/lender-rooms/requests-ui/use-attempt.ts';
import { recordTimelineAnswer } from '@odb/lender-rooms/timeline-answer/internal-actions.ts';
import { itemAnchor } from '@odb/notifications/relay';
import type { Enums } from '@odb/supabase';
import { Button } from '@odb/ui/button';

import { teamSignInPath } from '../lender-wording';
import { TIMELINE_ANSWERS } from './timeline-wording';

export interface RoomTimelineAnswer {
  id: string;
  name: string;
  answer: {
    answer: Enums<'lender_timeline_answer'>;
    source: Enums<'lender_side'>;
    note: string | null;
    earliest_close_date: string | null;
  } | null;
}

const SOURCE_WORDING: Record<Enums<'lender_side'>, string> = {
  lender: 'from the lender',
  internal: 'recorded by us',
};

function RoomAnswer({ room }: { room: RoomTimelineAnswer }) {
  const router = useRouter();
  const recording = useAttempt();

  return (
    <li
      id={itemAnchor({ kind: 'lender-timeline-answer', id: room.id })}
      className={'flex flex-col gap-2 px-4 py-3 text-sm'}
    >
      <div className={'flex flex-wrap items-center justify-between gap-3'}>
        <p>
          <span className={'font-medium'}>{room.name}</span>{' '}
          <span className={'text-muted-foreground'}>
            {room.answer
              ? `${TIMELINE_ANSWERS[room.answer.answer]}, ${SOURCE_WORDING[room.answer.source]}`
              : 'No answer yet'}
          </span>
        </p>
        <div className={'flex items-center gap-1'}>
          <span className={'text-muted-foreground mr-1'}>Record by hand</span>
          {(
            Object.keys(TIMELINE_ANSWERS) as Enums<'lender_timeline_answer'>[]
          ).map((answer) => (
            <Button
              key={answer}
              variant={'outline'}
              size={'sm'}
              aria-label={`Record ${TIMELINE_ANSWERS[answer].toLowerCase()} for ${room.name}`}
              disabled={recording.isPending}
              onClick={() =>
                recording.attempt(
                  () => recordTimelineAnswer({ roomId: room.id, answer }),
                  () => router.refresh(),
                )
              }
            >
              {TIMELINE_ANSWERS[answer]}
            </Button>
          ))}
        </div>
      </div>
      {room.answer?.earliest_close_date ? (
        <p>
          Earliest it can close: {longDate(room.answer.earliest_close_date)}
        </p>
      ) : null}
      {room.answer?.note ? (
        <p className={'text-muted-foreground whitespace-pre-line'}>
          {room.answer.note}
        </p>
      ) : null}
      <ProblemNote problem={recording.problem} signInPath={teamSignInPath} />
    </li>
  );
}

export function TimelineAnswers({ rooms }: { rooms: RoomTimelineAnswer[] }) {
  return (
    <ul className={'bg-card divide-y rounded-xl border'}>
      {rooms.map((room) => (
        <RoomAnswer key={room.id} room={room} />
      ))}
    </ul>
  );
}
