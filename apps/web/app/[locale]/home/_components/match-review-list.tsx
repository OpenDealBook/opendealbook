'use client';

import Link from 'next/link';

import type { Enums } from '@odb/supabase';
import { Button } from '@odb/ui/button';

import type { Action } from './approval-inbox';
import { SOURCE_LABELS } from './leads-pipeline';
import { useRefusableAction } from './use-refusable-action';

export type MatchReview = {
  id: string;
  score: number;
  source: Enums<'lead_source'>;
  recordName: string;
  recordLocation: string | null;
  candidateName: string;
} & (
  | { reason: 'weak_match' }
  | { reason: 'ein_conflict'; recordEin: string; candidateEin: string }
);

export function MatchReviewList({
  reviews,
  canDecide,
  workflowsHref,
  decide,
}: {
  reviews: MatchReview[];
  canDecide: boolean;
  workflowsHref: string;
  decide: Action<{ reviewId: string; accept: boolean }>;
}) {
  if (reviews.length === 0) {
    return (
      <div className={'flex flex-col items-start gap-3 rounded-md border p-6'}>
        <p className={'text-muted-foreground max-w-prose text-sm'}>
          No weak matches to review. When a workflow imports a record that might
          belong to one of your firms, it waits here for a deal manager.
        </p>
        <Button asChild variant={'outline'} size={'sm'}>
          <Link href={workflowsHref}>Open Workflows</Link>
        </Button>
      </div>
    );
  }

  return (
    <ul className={'divide-y rounded-md border'}>
      {reviews.map((review) => (
        <li key={review.id}>
          <ReviewItem review={review} canDecide={canDecide} decide={decide} />
        </li>
      ))}
    </ul>
  );
}

function ReviewItem({
  review,
  canDecide,
  decide,
}: {
  review: MatchReview;
  canDecide: boolean;
  decide: Action<{ reviewId: string; accept: boolean }>;
}) {
  const { run, refusal, pending } = useRefusableAction();
  const choose = (accept: boolean) =>
    run(() => decide({ reviewId: review.id, accept }));

  return (
    <div
      className={
        'grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center'
      }
    >
      <div className={'flex min-w-0 flex-col'}>
        <span className={'text-muted-foreground text-xs'}>
          {SOURCE_LABELS[review.source]} record
        </span>
        <span className={'font-medium'}>{review.recordName}</span>
        {review.recordLocation ? (
          <span className={'text-muted-foreground text-sm'}>
            {review.recordLocation}
          </span>
        ) : null}
        {review.reason === 'ein_conflict' ? (
          <span className={'text-muted-foreground text-sm tabular-nums'}>
            EIN {review.recordEin}
          </span>
        ) : null}
      </div>
      <div className={'flex min-w-0 flex-col'}>
        <span className={'text-muted-foreground text-xs'}>
          Possible match:{' '}
          {review.reason === 'ein_conflict' ? 'Different EIN' : 'Weak match'}
        </span>
        <span className={'font-medium'}>{review.candidateName}</span>
        {review.reason === 'ein_conflict' ? (
          <span className={'text-muted-foreground text-sm tabular-nums'}>
            EIN {review.candidateEin}
          </span>
        ) : null}
        <span className={'text-muted-foreground text-sm tabular-nums'}>
          Score {review.score.toFixed(2)}
        </span>
      </div>
      {canDecide ? (
        <div className={'flex gap-2'}>
          <Button size={'sm'} disabled={pending} onClick={() => choose(true)}>
            Accept
          </Button>
          <Button
            size={'sm'}
            variant={'outline'}
            disabled={pending}
            onClick={() => choose(false)}
          >
            Reject
          </Button>
        </div>
      ) : null}
      {refusal ? (
        <p role={'alert'} className={'text-destructive text-sm md:col-span-3'}>
          {refusal}
        </p>
      ) : null}
    </div>
  );
}
