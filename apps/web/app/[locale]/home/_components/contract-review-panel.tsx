'use client';

import { useId, useState } from 'react';

import {
  decideContractReview,
  overrideContractSigning,
  requestContractReview,
} from '@odb/contracts';
import { sendContractForSignature } from '@odb/deals/server';
import { Button } from '@odb/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@odb/ui/dialog';
import { Label } from '@odb/ui/label';
import { Textarea } from '@odb/ui/textarea';

import { type Signer, SignerInputs, oneBlankSigner } from './signer-inputs';
import { useRefusableAction } from './use-refusable-action';

type Side = 'buyer' | 'seller';
type Verdict = 'approved' | 'changes_needed' | 'approved_with_comments';

export interface ContractReview {
  required: boolean;
  ready: boolean;
  sendable: boolean;
  counsel: Record<Side, boolean>;
  requests: { requestedAt: string }[];
  decisions: {
    side: Side;
    decision: Verdict;
    note: string | null;
    withoutCounsel: boolean;
    decidedAt: string;
  }[];
  overrides: { reason: string; overriddenAt: string }[];
}

type Decision = ContractReview['decisions'][number];

const VERDICT: Record<Verdict, string> = {
  approved: 'Approved',
  changes_needed: 'Changes needed',
  approved_with_comments: 'Approved with comments',
};

const PARTY: Record<Side, string> = { buyer: 'Buyer', seller: 'Seller' };
const COUNSEL: Record<Side, string> = {
  buyer: "Buyer's counsel",
  seller: "Seller's counsel",
};

function day(at: string): string {
  return new Date(at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function verdictText(decision: Decision): string {
  const label =
    decision.decision === 'approved' && decision.withoutCounsel
      ? 'Approved without counsel'
      : VERDICT[decision.decision];

  return decision.note ? `${label}: ${decision.note}` : label;
}

function sideStatus(review: ContractReview, side: Side): string {
  const latest = review.decisions.filter((each) => each.side === side).at(-1);
  const asked = review.requests.at(-1);

  if (latest) {
    return verdictText(latest);
  }

  return asked
    ? `Waiting since ${day(asked.requestedAt)}`
    : 'Not requested yet';
}

function historyOf(review: ContractReview) {
  return [
    ...review.requests.map(({ requestedAt }) => ({
      at: requestedAt,
      text: 'Review requested',
    })),
    ...review.decisions.map((decision) => ({
      at: decision.decidedAt,
      text: `${decision.withoutCounsel ? PARTY[decision.side] : COUNSEL[decision.side]}: ${verdictText(decision)}`,
    })),
    ...review.overrides.map(({ reason, overriddenAt }) => ({
      at: overriddenAt,
      text: `Sign-off overridden: ${reason}`,
    })),
  ].toSorted((a, b) => a.at.localeCompare(b.at));
}

export function ContractReviewPanel({
  contractVersionId,
  review,
  canManage,
}: {
  contractVersionId: string;
  review: ContractReview;
  canManage: boolean;
}) {
  const { refusal, pending, run } = useRefusableAction();
  const history = historyOf(review);

  return (
    <div className={'flex flex-col gap-3'}>
      {review.required ? null : (
        <p className={'text-muted-foreground text-sm'}>
          Counsel sign-off is not required.
        </p>
      )}
      <dl className={'grid gap-1 text-sm sm:grid-cols-2'}>
        {(['buyer', 'seller'] as const).map((side) => (
          <div key={side} data-review-side className={'flex flex-col'}>
            <dt className={'text-muted-foreground'}>
              {review.counsel[side] ? COUNSEL[side] : PARTY[side]}
            </dt>{' '}
            <dd className={'font-medium'}>{sideStatus(review, side)}</dd>
          </div>
        ))}
      </dl>
      {review.overrides.map(({ reason, overriddenAt }) => (
        <p key={overriddenAt} className={'text-sm font-medium'}>
          Overridden: {reason}
        </p>
      ))}
      {history.length > 0 ? (
        <details>
          <summary className={'text-sm'}>History</summary>
          <ol
            data-review-history
            className={'mt-2 flex flex-col gap-1 text-sm'}
          >
            {history.map((entry, index) => (
              <li key={index}>
                {day(entry.at)}: {entry.text}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
      {canManage && review.sendable ? (
        <div className={'flex flex-wrap items-center gap-2'}>
          <Button
            size={'sm'}
            variant={'outline'}
            disabled={pending}
            onClick={() =>
              run(() => requestContractReview({ contractVersionId }))
            }
          >
            Ask counsel to review
          </Button>
          {review.counsel.buyer ? null : (
            <Button
              size={'sm'}
              variant={'outline'}
              disabled={pending}
              onClick={() =>
                run(() =>
                  decideContractReview({
                    contractVersionId,
                    decision: 'approved',
                  }),
                )
              }
            >
              Approve for buyer
            </Button>
          )}
          {review.ready ? (
            <SendDialog
              label={'Send for signature'}
              send={(signers) =>
                sendContractForSignature({
                  contract_version_id: contractVersionId,
                  signers,
                })
              }
            />
          ) : (
            <SendDialog
              label={'Override and send'}
              askReason
              send={async (signers, reason) => {
                const overridden = await overrideContractSigning({
                  contractVersionId,
                  reason,
                });

                return overridden.ok
                  ? sendContractForSignature({
                      contract_version_id: contractVersionId,
                      signers,
                    })
                  : overridden;
              }}
            />
          )}
        </div>
      ) : null}
      {refusal ? (
        <p role={'alert'} className={'text-destructive text-sm'}>
          {refusal}
        </p>
      ) : null}
    </div>
  );
}

function SendDialog({
  label,
  askReason = false,
  send,
}: {
  label: string;
  askReason?: boolean;
  send: (
    signers: Signer[],
    reason: string,
  ) => ReturnType<typeof overrideContractSigning>;
}) {
  const [open, setOpen] = useState(false);
  const [signers, setSigners] = useState(oneBlankSigner);
  const [reason, setReason] = useState('');
  const reasonId = useId();
  const { refusal, pending, run } = useRefusableAction();

  return (
    <>
      <Button size={'sm'} disabled={pending} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
          </DialogHeader>
          <form
            className={'flex flex-col gap-4'}
            onSubmit={(event) => {
              event.preventDefault();
              run(
                () => send(signers, reason),
                () => {
                  setOpen(false);
                  setSigners(oneBlankSigner);
                  setReason('');
                },
              );
            }}
          >
            {askReason ? (
              <div className={'flex flex-col gap-1'}>
                <Label htmlFor={reasonId}>Reason</Label>
                <Textarea
                  id={reasonId}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  required
                />
                <p className={'text-muted-foreground text-sm'}>
                  Counsel sign-off is skipped for this version for good. The
                  reason is logged and counsel are told.
                </p>
              </div>
            ) : null}
            <p className={'text-muted-foreground text-sm'}>
              This creates a draft in Documenso. You place the signature fields
              there and it goes out to the signers from Documenso.
            </p>
            <SignerInputs signers={signers} onChange={setSigners} />
            {refusal ? (
              <p role={'alert'} className={'text-destructive text-sm'}>
                {refusal}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type={'button'}
                variant={'outline'}
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type={'submit'} disabled={pending}>
                {label}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
