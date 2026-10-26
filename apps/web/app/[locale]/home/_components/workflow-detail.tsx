'use client';

import { useState, useTransition } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import type { ActionResult } from '@odb/next/refusal';
import type { Tables } from '@odb/supabase';
import { Badge } from '@odb/ui/badge';
import { Button } from '@odb/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@odb/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@odb/ui/dialog';
import { Input } from '@odb/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@odb/ui/table';

import { WorkflowRunStatus, workflowTime } from './workflow-run-status';

type Version = Pick<
  Tables<'workflow_version'>,
  'id' | 'published_at' | 'saved_at'
> & { publisher: string | null };

type Run = Pick<
  Tables<'workflow_run'>,
  'id' | 'status' | 'trigger_kind' | 'version_id' | 'started_at' | 'finished_at'
>;

type RenameWorkflow = (input: {
  workflowId: string;
  name: string;
}) => Promise<ActionResult<unknown>>;

type CancelWaitingRuns = (input: {
  accountId: string;
  workflowId: string;
}) => Promise<ActionResult<{ cancelled: number; unreached: number }>>;

const TRIGGER_LABELS: Record<Run['trigger_kind'], string> = {
  manual: 'Manual',
  schedule: 'Schedule',
  event: 'Event',
};

export function WorkflowDetail(props: {
  accountId: string;
  workflowPath: string;
  workflow: Pick<Tables<'workflow'>, 'id' | 'name' | 'enabled' | 'archived_at'>;
  versions: Version[];
  runs: Run[];
  canManage: boolean;
  cancelWaitingRuns: CancelWaitingRuns;
  renameWorkflow: RenameWorkflow;
}) {
  const [renaming, setRenaming] = useState(false);
  const published = props.versions.filter(
    (version) => version.published_at !== null,
  );
  const draft = props.versions.find((version) => version.published_at === null);
  const versionNames = new Map(
    published.map((version, index) => [
      version.id,
      `Version ${published.length - index}`,
    ]),
  );

  return (
    <div className={'flex flex-col gap-6'}>
      <header className={'flex flex-wrap items-center gap-3'}>
        {renaming ? (
          <RenameForm
            name={props.workflow.name}
            onSave={(name) =>
              props.renameWorkflow({ workflowId: props.workflow.id, name })
            }
            onDone={() => setRenaming(false)}
          />
        ) : (
          <h1 className={'text-2xl font-semibold'}>{props.workflow.name}</h1>
        )}
        <Badge variant={props.workflow.enabled ? 'default' : 'outline'}>
          {props.workflow.enabled ? 'Enabled' : 'Disabled'}
        </Badge>
        {props.workflow.archived_at ? (
          <Badge variant={'secondary'}>Archived</Badge>
        ) : null}
        {props.canManage && !renaming ? (
          <Button
            type={'button'}
            variant={'ghost'}
            size={'sm'}
            onClick={() => setRenaming(true)}
          >
            Rename
          </Button>
        ) : null}
      </header>

      <div className={'grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]'}>
        <Card className={'order-2 lg:order-1'}>
          <CardHeader>
            <CardTitle>Runs</CardTitle>
            {props.canManage && published.length > 0 ? (
              <CardAction>
                <CancelWaitingRunsButton
                  onConfirm={() =>
                    props.cancelWaitingRuns({
                      accountId: props.accountId,
                      workflowId: props.workflow.id,
                    })
                  }
                />
              </CardAction>
            ) : null}
          </CardHeader>
          <CardContent>
            {props.runs.length === 0 ? (
              <p className={'text-muted-foreground text-sm'}>
                This workflow has not run yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Started</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Finished</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {props.runs.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell>
                        <Link
                          href={`${props.workflowPath}/runs/${run.id}`}
                          className={'font-medium underline-offset-4 hover:underline'}
                        >
                          {workflowTime.format(new Date(run.started_at))}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <WorkflowRunStatus status={run.status} />
                      </TableCell>
                      <TableCell>{TRIGGER_LABELS[run.trigger_kind]}</TableCell>
                      <TableCell>{versionNames.get(run.version_id)}</TableCell>
                      <TableCell className={'text-muted-foreground'}>
                        {run.finished_at
                          ? workflowTime.format(new Date(run.finished_at))
                          : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className={'order-1 lg:order-2'}>
          <CardHeader>
            <CardTitle>Versions</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className={'flex flex-col gap-3 text-sm'}>
              {draft ? (
                <li className={'flex flex-col'}>
                  <span className={'font-medium'}>Draft</span>
                  <span className={'text-muted-foreground'}>
                    Last saved {workflowTime.format(new Date(draft.saved_at))}
                  </span>
                </li>
              ) : null}
              {published.map((version) => (
                <li key={version.id} className={'flex flex-col'}>
                  <span className={'font-medium'}>
                    {versionNames.get(version.id)}
                  </span>
                  <span className={'text-muted-foreground'}>
                    Published by {version.publisher}{' '}
                    {workflowTime.format(new Date(version.published_at!))}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function RenameForm(props: {
  name: string;
  onSave: (name: string) => ReturnType<RenameWorkflow>;
  onDone: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(props.name);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className={'flex flex-wrap items-center gap-2'}
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await props.onSave(name);

          if (result.ok) {
            props.onDone();
            router.refresh();
          } else {
            setRefusal(result.refusal);
          }
        });
      }}
    >
      <Input
        aria-label={'Workflow name'}
        required
        value={name}
        onChange={(event) => setName(event.target.value)}
        className={'w-64'}
      />
      <Button type={'submit'} size={'sm'} disabled={isPending}>
        Save name
      </Button>
      <Button
        type={'button'}
        variant={'ghost'}
        size={'sm'}
        onClick={props.onDone}
      >
        Cancel
      </Button>
      {refusal ? (
        <p role={'alert'} className={'text-destructive w-full text-sm'}>
          {refusal}
        </p>
      ) : null}
    </form>
  );
}

function CancelWaitingRunsButton(props: {
  onConfirm: () => ReturnType<CancelWaitingRuns>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await props.onConfirm();

      if (result.ok) {
        setOutcome(cancelledOutcome(result.value));
        setOpen(false);
      }
      setRefusal(result.ok ? null : result.refusal);
      router.refresh();
    });
  }

  return (
    <div className={'flex items-center gap-3'}>
      <p role={'status'} className={'text-muted-foreground text-sm'}>
        {outcome}
      </p>
      <Button
        type={'button'}
        size={'sm'}
        variant={'outline'}
        onClick={() => setOpen(true)}
      >
        Cancel waiting runs
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel waiting runs</DialogTitle>
            <DialogDescription>
              This cancels unfinished runs on versions older than the latest
              published version. Runs on the latest version keep going.
            </DialogDescription>
          </DialogHeader>
          {refusal ? (
            <p role={'alert'} className={'text-destructive text-sm'}>
              {refusal}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type={'button'}
              variant={'outline'}
              disabled={isPending}
              onClick={() => setOpen(false)}
            >
              Keep them
            </Button>
            <Button
              type={'button'}
              variant={'destructive'}
              disabled={isPending}
              onClick={confirm}
            >
              Cancel older runs
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function cancelledOutcome(result: { cancelled: number; unreached: number }) {
  const cancelled = `Cancelled ${result.cancelled} ${result.cancelled === 1 ? 'run' : 'runs'}`;

  return result.unreached > 0
    ? `${cancelled}. ${result.unreached} couldn't be reached, try again.`
    : cancelled;
}
