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
  | 'wake_at'
  | 'iteration_path'
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
  run: Pick<
    Tables<'workflow_run'>,
    'id' | 'status' | 'error' | 'loop_items_processed' | 'loop_items_total'
  >;
  steps: Step[];
  labels: Record<string, string>;
  loops: string[];
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
      {props.run.error ? (
        <p className={'text-destructive text-sm'}>
          This run could not start: {props.run.error}
        </p>
      ) : null}
      {props.run.loop_items_total > props.run.loop_items_processed ? (
        <p className={'text-sm'}>
          {props.run.loop_items_processed} of {props.run.loop_items_total} loop
          items; the rest run next time
        </p>
      ) : null}
      <div className={'flex flex-wrap items-center gap-3'}>
        <WorkflowRunStatus status={props.run.status} />
        {retryable && props.run.error ? (
          <p className={'text-muted-foreground text-sm'}>
            This run never started. Fix the workflow, then run it again.
          </p>
        ) : null}
        {retryable && !props.run.error && !props.stepDataRemoved ? (
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
            <StepCard
              step={step}
              label={props.labels[step.node_id] ?? step.node_id}
              loop={props.loops.includes(step.node_id)}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

function StepCard({
  step,
  label,
  loop,
}: {
  step: Step;
  label: string;
  loop: boolean;
}) {
  return (
    <Card>
      <CardHeader className={'flex flex-wrap items-center gap-3'}>
        <CardTitle>
          {step.iteration_path.length > 0
            ? `${label} (item ${step.iteration_path.map((index) => index + 1).join(', ')})`
            : label}
        </CardTitle>
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
        {step.status === 'waiting' && step.wake_at ? (
          <p className={'text-sm'}>
            Waiting until {workflowTime.format(new Date(step.wake_at))}
          </p>
        ) : null}
        {loop && step.output !== null ? (
          <LoopCount output={step.output as LoopOutput} />
        ) : null}
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

type LoopOutput = { items: unknown[] };

function LoopCount({ output }: { output: LoopOutput }) {
  return <p className={'text-sm'}>{output.items.length} items</p>;
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
