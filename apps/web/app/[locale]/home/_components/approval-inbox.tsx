'use client';

import { useId, useState } from 'react';

import Link from 'next/link';

import type { ActionResult } from '@odb/next/refusal';
import { Badge } from '@odb/ui/badge';
import { Button } from '@odb/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@odb/ui/card';
import { Label } from '@odb/ui/label';
import { Textarea } from '@odb/ui/textarea';

import { useRefusableAction } from './use-refusable-action';
import { workflowTime } from './workflow-run-status';

type WaitingStep = {
  stepRunId: string;
  runId: string;
  runHref: string;
  workflowName: string;
  since: string;
};

export type WaitingDecision = WaitingStep &
  (
    | { kind: 'approval'; prompt: string }
    | {
        kind: 'verdict';
        verdictId: string;
        firmName: string;
        fit: boolean;
        reasons: string[];
      }
  );

export type ApprovedFirm = {
  verdictId: string;
  firmName: string;
  approvedAt: string;
  overrideReason: string | null;
};

export type Action<Input> = (input: Input) => Promise<ActionResult<void>>;

type StepDecision = {
  accountId: string;
  runId: string;
  stepRunId: string;
  approved: boolean;
};

type InboxActions = {
  decideApproval: Action<StepDecision>;
  decideVerdict: Action<StepDecision & { verdictId: string; reason?: string }>;
  revokeVerdict: Action<{
    accountId: string;
    verdictId: string;
    reason: string;
  }>;
};

export function ApprovalInbox(
  props: InboxActions & {
    accountId: string;
    waiting: WaitingDecision[];
    approved: ApprovedFirm[];
  },
) {
  return (
    <div className={'flex flex-col gap-8'}>
      <section className={'flex flex-col gap-4'}>
        <h2 className={'text-lg font-semibold'}>Waiting for a decision</h2>
        {props.waiting.length === 0 ? (
          <p className={'text-muted-foreground text-sm'}>
            Nothing is waiting for a decision. Workflows with an approval or a
            firm verdict show up here when they reach it.
          </p>
        ) : (
          <ul className={'flex flex-col gap-4'}>
            {props.waiting.map((decision) => (
              <li key={decision.stepRunId}>
                <WaitingCard {...props} decision={decision} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {props.approved.length > 0 ? (
        <section className={'flex flex-col gap-4'}>
          <h2 className={'text-lg font-semibold'}>Approved firms</h2>
          <ul className={'flex flex-col gap-4'}>
            {props.approved.map((firm) => (
              <li key={firm.verdictId}>
                <ApprovedCard {...props} firm={firm} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function WaitingCard(
  props: InboxActions & { accountId: string; decision: WaitingDecision },
) {
  const { run, refusal, pending } = useRefusableAction();
  const [overriding, setOverriding] = useState(false);
  const { decision } = props;
  const step = {
    accountId: props.accountId,
    runId: decision.runId,
    stepRunId: decision.stepRunId,
  };
  const decide = (approved: boolean, reason?: string) =>
    run(() =>
      decision.kind === 'approval'
        ? props.decideApproval({ ...step, approved })
        : props.decideVerdict({
            ...step,
            verdictId: decision.verdictId,
            approved,
            ...(reason === undefined ? {} : { reason }),
          }),
    );
  const needsOverride = decision.kind === 'verdict' && !decision.fit;

  return (
    <Card>
      <CardHeader className={'flex flex-col gap-2'}>
        <CardTitle className={'text-base'}>
          {decision.kind === 'approval' ? decision.prompt : decision.firmName}
        </CardTitle>
        <p
          className={
            'text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm'
          }
        >
          <span>{decision.workflowName}</span>
          <span>
            Waiting since {workflowTime.format(new Date(decision.since))}
          </span>
          <Link
            href={decision.runHref}
            className={'underline-offset-4 hover:underline'}
          >
            Open run
          </Link>
        </p>
      </CardHeader>
      {decision.kind === 'verdict' ? (
        <CardContent className={'flex flex-col gap-2'}>
          <Badge
            variant={decision.fit ? 'default' : 'destructive'}
            className={'w-fit'}
          >
            {decision.fit ? 'Fit' : 'Not a fit'}
          </Badge>
          <ul className={'list-disc pl-5 text-sm'}>
            {decision.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </CardContent>
      ) : null}
      <CardFooter className={'flex flex-col items-start gap-3'}>
        {overriding ? (
          <ReasonForm
            label={'Override reason'}
            submitLabel={'Approve with this reason'}
            disabled={pending}
            onSubmit={(reason) => decide(true, reason)}
            onCancel={() => setOverriding(false)}
          />
        ) : (
          <div className={'flex flex-wrap gap-2'}>
            {needsOverride ? (
              <Button
                type={'button'}
                size={'sm'}
                disabled={pending}
                onClick={() => setOverriding(true)}
              >
                Override and approve
              </Button>
            ) : (
              <Button
                type={'button'}
                size={'sm'}
                disabled={pending}
                onClick={() => decide(true)}
              >
                Approve
              </Button>
            )}
            <Button
              type={'button'}
              size={'sm'}
              variant={'outline'}
              disabled={pending}
              onClick={() => decide(false)}
            >
              Reject
            </Button>
          </div>
        )}
        {refusal ? (
          <p role={'alert'} className={'text-destructive text-sm'}>
            {refusal}
          </p>
        ) : null}
      </CardFooter>
    </Card>
  );
}

function ApprovedCard(
  props: InboxActions & { accountId: string; firm: ApprovedFirm },
) {
  const { run, refusal, pending } = useRefusableAction();
  const [revoking, setRevoking] = useState(false);
  const { firm } = props;

  return (
    <Card>
      <CardHeader className={'flex flex-col gap-2'}>
        <CardTitle className={'text-base'}>{firm.firmName}</CardTitle>
        <p className={'text-muted-foreground text-sm'}>
          Approved {workflowTime.format(new Date(firm.approvedAt))}
        </p>
        {firm.overrideReason ? (
          <p className={'text-sm'}>Override reason: {firm.overrideReason}</p>
        ) : null}
      </CardHeader>
      <CardFooter className={'flex flex-col items-start gap-3'}>
        {revoking ? (
          <ReasonForm
            label={'Revoke reason'}
            submitLabel={'Revoke with this reason'}
            disabled={pending}
            onSubmit={(reason) =>
              run(() =>
                props.revokeVerdict({
                  accountId: props.accountId,
                  verdictId: firm.verdictId,
                  reason,
                }),
              )
            }
            onCancel={() => setRevoking(false)}
          />
        ) : (
          <Button
            type={'button'}
            size={'sm'}
            variant={'outline'}
            onClick={() => setRevoking(true)}
          >
            Revoke
          </Button>
        )}
        {refusal ? (
          <p role={'alert'} className={'text-destructive text-sm'}>
            {refusal}
          </p>
        ) : null}
      </CardFooter>
    </Card>
  );
}

function ReasonForm(props: {
  label: string;
  submitLabel: string;
  disabled: boolean;
  onSubmit: (reason: string) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [reason, setReason] = useState('');

  return (
    <div className={'flex w-full max-w-xl flex-col gap-2'}>
      <Label htmlFor={id}>{props.label}</Label>
      <Textarea
        id={id}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <p className={'text-muted-foreground text-xs'}>
        This becomes a team fact the decision model reads on later verdicts.
      </p>
      <div className={'flex flex-wrap gap-2'}>
        <Button
          type={'button'}
          size={'sm'}
          disabled={props.disabled}
          onClick={() => props.onSubmit(reason)}
        >
          {props.submitLabel}
        </Button>
        <Button
          type={'button'}
          size={'sm'}
          variant={'ghost'}
          onClick={props.onCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
