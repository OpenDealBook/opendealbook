import Link from 'next/link';

import type { Enums } from '@odb/supabase';
import { Badge } from '@odb/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@odb/ui/table';
import { cn } from '@odb/ui/utils';

import { NewWorkflowForm } from './new-workflow-form';
import { SavedAt } from './saved-at';
import { WorkflowRunStatus } from './workflow-run-status';
import { WorkflowRowActions } from './workflows-list-actions';

type RunStatus = Enums<'workflow_run_status'>;

export interface WorkflowListRow {
  id: string;
  name: string;
  enabled: boolean;
  archived: boolean;
  publishedAt: string | null;
  lastRun: { status: RunStatus; startedAt: string } | null;
}

export function WorkflowsList({
  workflows,
  view,
  canManage,
  accountId,
  basePath,
}: {
  workflows: WorkflowListRow[];
  view: 'active' | 'archived';
  canManage: boolean;
  accountId: string;
  basePath: string;
}) {
  return (
    <div className={'flex flex-col gap-4'}>
      <div className={'flex flex-wrap items-center justify-between gap-2'}>
        <nav aria-label={'Workflow filter'} className={'flex gap-1'}>
          {(
            [
              ['active', 'Active', basePath],
              ['archived', 'Archived', `${basePath}?view=archived`],
            ] as const
          ).map(([key, label, href]) => (
            <Link
              key={key}
              href={href}
              aria-current={view === key ? 'page' : undefined}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm',
                view === key
                  ? 'bg-secondary text-secondary-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
        {canManage ? (
          <NewWorkflowForm accountId={accountId} basePath={basePath} />
        ) : null}
      </div>

      {workflows.length === 0 ? (
        <p className={'text-muted-foreground rounded-md border p-6 text-sm'}>
          {view === 'archived'
            ? 'No archived workflows.'
            : canManage
              ? 'No workflows yet. Create one with New workflow.'
              : 'No workflows yet. A workflows manager can create one.'}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Published version</TableHead>
              <TableHead>Last run</TableHead>
              {canManage ? (
                <TableHead>
                  <span className={'sr-only'}>Actions</span>
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {workflows.map((workflow) => (
              <TableRow key={workflow.id}>
                <TableCell className={'font-medium'}>
                  <Link
                    href={`${basePath}/${workflow.id}`}
                    className={'hover:underline'}
                  >
                    {workflow.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={workflow.enabled ? 'default' : 'outline'}>
                    {workflow.enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </TableCell>
                <TableCell className={'text-muted-foreground'}>
                  {workflow.publishedAt ? (
                    <>
                      Published <SavedAt iso={workflow.publishedAt} />
                    </>
                  ) : (
                    'Not published'
                  )}
                </TableCell>
                <TableCell>
                  {workflow.lastRun ? (
                    <span className={'flex flex-col items-start gap-1'}>
                      <WorkflowRunStatus status={workflow.lastRun.status} />
                      <span className={'text-muted-foreground text-xs'}>
                        <SavedAt iso={workflow.lastRun.startedAt} />
                      </span>
                    </span>
                  ) : (
                    <span className={'text-muted-foreground'}>Never run</span>
                  )}
                </TableCell>
                {canManage ? (
                  <TableCell>
                    <WorkflowRowActions
                      workflowId={workflow.id}
                      enabled={workflow.enabled}
                      archived={workflow.archived}
                    />
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
