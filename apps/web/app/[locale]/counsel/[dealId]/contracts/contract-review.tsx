'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import type { decideContractReview } from '@odb/contracts';
import type { Database } from '@odb/supabase';
import { Button } from '@odb/ui/button';
import { Label } from '@odb/ui/label';
import { Textarea } from '@odb/ui/textarea';

type Verdict = Database['public']['Enums']['contract_review_verdict'];

export type DecideReview = typeof decideContractReview;

export interface VersionReview {
  requests: { id: string; requestedBy: string; requestedAt: string }[];
  decisions: {
    id: string;
    decision: Verdict;
    note: string | null;
    decidedAt: string;
    withoutCounsel: boolean;
  }[];
}

const VERDICT_LABEL: Record<Verdict, string> = {
  approved: 'Approved',
  approved_with_comments: 'Approved with comments',
  changes_needed: 'Changes needed',
};

const CHOICES: { decision: Verdict; label: string }[] = [
  { decision: 'approved', label: 'Approve' },
  { decision: 'approved_with_comments', label: 'Approve with comments' },
  { decision: 'changes_needed', label: 'Changes needed' },
];

function day(timestamp: string) {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function ContractReview({
  contractVersionId,
  review,
  decide,
  redlineUpload,
}: {
  contractVersionId: string;
  review: VersionReview;
  decide: DecideReview | null;
  redlineUpload: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [refusal, setRefusal] = useState<string | null>(null);
  const [isDeciding, startDeciding] = useTransition();
  const noteId = `review-note-${contractVersionId}`;

  function answer(decision: Verdict) {
    startDeciding(async () => {
      const result = await decide!({
        contractVersionId,
        decision,
        note: note.trim() || undefined,
      });

      setRefusal(result.ok ? null : result.refusal);

      if (result.ok) {
        setNote('');
        router.refresh();
      }
    });
  }

  return (
    <div className={'flex flex-col gap-3'}>
      {review.requests.length > 0 ? (
        <ul className={'text-muted-foreground flex flex-col gap-1 text-sm'}>
          {review.requests.map((request) => (
            <li key={request.id} data-review-request>
              Review requested by {request.requestedBy} on{' '}
              {day(request.requestedAt)}
            </li>
          ))}
        </ul>
      ) : null}
      {review.decisions.length > 0 ? (
        <ol className={'flex flex-col gap-1 text-sm'}>
          {review.decisions.map((decision, index) => (
            <li
              key={decision.id}
              data-review-decision
              className={index === 0 ? 'font-medium' : 'text-muted-foreground'}
            >
              {VERDICT_LABEL[decision.decision]} on {day(decision.decidedAt)}
              {decision.withoutCounsel ? ', confirmed without counsel' : null}
              {decision.note ? `: ${decision.note}` : null}
            </li>
          ))}
        </ol>
      ) : null}
      {decide ? (
        <div className={'flex flex-col gap-2'}>
          <Label htmlFor={noteId}>Note</Label>
          <Textarea
            id={noteId}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          {redlineUpload ? (
            <p className={'text-muted-foreground text-xs'}>
              Asking for changes? You can also upload a redline below.
            </p>
          ) : null}
          <div className={'flex flex-wrap items-center gap-2'}>
            {CHOICES.map((choice) => (
              <Button
                key={choice.decision}
                type={'button'}
                size={'sm'}
                variant={
                  choice.decision === 'changes_needed' ? 'outline' : 'default'
                }
                disabled={isDeciding}
                onClick={() => answer(choice.decision)}
              >
                {choice.label}
              </Button>
            ))}
            {refusal ? (
              <span role={'alert'} className={'text-destructive text-sm'}>
                {refusal}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
