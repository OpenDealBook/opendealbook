'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import type { ActionResult } from '@odb/next/refusal';
import type { Tables } from '@odb/supabase';
import { Button } from '@odb/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';

import { WorkflowRunStatus, workflowTime } from './workflow-run-status';

type Step = Pick<
  Tables<'workflow_step_run'>,
  | 'id'
  | 'node_id'
  | 'attempt'
  | 'status'
  | 'input'
  | 'output'
  | 'error'
  | 'started_at'
  | 'finished_at'
> & {
  logs: Pick<
    Tables<'workflow_step_log'>,
    'id' | 'level' | 'message' | 'details' | 'created_at'
  >[];
};

type RunAction = (input: {
  accountId: string;
  runId: string;
}) => Promise<ActionResult<void>>;

export function WorkflowRunDetail(props: {
  accountId: string;
  run: Pick<Tables<'workflow_run'>, 'id' | 'status'>;
  steps: Step[];
  labels: Record<string, string>;
  stepDataRemoved: boolean;
  unfinished: boolean;
  canManage: boolean;
  cancelRun: RunAction;
  retryRun: RunAction;
}) {
  const router = useRouter();
  const retryable = props.canManage && props.run.status === 'failed';
  const [refusal, setRefusal] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function act(action: RunAction) {
    startTransition(async () => {
      const result = await action({
        accountId: props.accountId,
        runId: props.run.id,
      });

      setRefusal(result.ok ? null : result.refusal);
      router.refresh();
    });
  }

  return (
    <div className={'flex flex-col gap-6'}>
      <div className={'flex flex-wrap items-center gap-3'}>
        <WorkflowRunStatus status={props.run.status} />
        {retryable && !props.stepDataRemoved ? (
          <Button
            type={'button'}
            size={'sm'}
            disabled={isPending}
            onClick={() => act(props.retryRun)}
          >
            Retry from failed step
          </Button>
        ) : null}
        {props.canManage && props.unfinished ? (
          <Button
            type={'button'}
            size={'sm'}
            variant={'outline'}
            disabled={isPending}
            onClick={() => act(props.cancelRun)}
          >
            Cancel run
          </Button>
        ) : null}
        {refusal ? (
          <p role={'alert'} className={'text-destructive text-sm'}>
            {refusal}
          </p>
        ) : null}
      </div>

      {props.stepDataRemoved ? (
        <p className={'text-muted-foreground text-sm'}>
          {retryable
            ? 'Step data was removed after 90 days. Run the workflow again instead.'
            : 'Step data was removed after 90 days'}
        </p>
      ) : null}

      <ol className={'flex flex-col gap-4'}>
        {props.steps.map((step) => (
          <li key={step.id}>
            <StepCard step={step} label={props.labels[step.node_id] ?? step.node_id} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function StepCard({ step, label }: { step: Step; label: string }) {
  return (
    <Card>
      <CardHeader className={'flex flex-wrap items-center gap-3'}>
        <CardTitle>{label}</CardTitle>
        <WorkflowRunStatus status={step.status} />
        <span className={'text-muted-foreground text-sm'}>
          Attempt {step.attempt}
        </span>
        <span className={'text-muted-foreground text-sm'}>
          {workflowTime.format(new Date(step.started_at))}
          {step.finished_at
            ? ` to ${workflowTime.format(new Date(step.finished_at))}`
            : null}
        </span>
      </CardHeader>
      <CardContent className={'flex flex-col gap-4'}>
        {step.error ? (
          <p className={'text-destructive text-sm'}>{step.error}</p>
        ) : null}
        <div className={'grid gap-4 lg:grid-cols-2'}>
          <JsonBlock title={'Input'} value={step.input} />
          <JsonBlock title={'Output'} value={step.output} />
        </div>
        {step.logs.length > 0 ? (
          <ul className={'flex flex-col gap-2 text-sm'}>
            {step.logs.map((log) => (
              <li key={log.id} className={'flex flex-col gap-1'}>
                <span>
                  <span
                    className={
                      log.level === 'error'
                        ? 'text-destructive font-medium'
                        : 'text-muted-foreground font-medium'
                    }
                  >
                    {log.level}
                  </span>{' '}
                  {log.message}{' '}
                  <span className={'text-muted-foreground'}>
                    {workflowTime.format(new Date(log.created_at))}
                  </span>
                </span>
                <pre className={'bg-muted overflow-x-auto rounded-md p-2 text-xs'}>
                  {JSON.stringify(log.details, null, 2)}
                </pre>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

function JsonBlock({ title, value }: { title: string; value: Step['input'] }) {
  return (
    <div className={'flex min-w-0 flex-col gap-1'}>
      <span className={'text-sm font-medium'}>{title}</span>
      {value === null ? (
        <span className={'text-muted-foreground text-sm'}>None</span>
      ) : (
        <pre className={'bg-muted overflow-x-auto rounded-md p-2 text-xs'}>
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  );
}
