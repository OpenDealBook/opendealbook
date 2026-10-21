import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Enums } from '@odb/supabase';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { WorkflowNotFoundError } from '@temporalio/client';

import { getTemporalClient, TASK_QUEUE } from '../client';
import { isTeamLocked } from '../teamLock';
import { parseWorkflowGraph } from './graph';
import { TEAM_UNLOCKED_SIGNAL, workflowRunWorkflowId } from './ids';
import type { RunPublishedWorkflowInput } from './workflow';

export { teamTimezone } from './team-timezone';
export {
  parseWorkflowGraph,
  type RunnableGraph,
  type StepIo,
  type TriggerNode,
  type WorkflowEdge,
  type WorkflowGraph,
} from './graph';

const REFUSALS = {
  not_permitted: 'Running a workflow needs workflows.manage',
  archived: 'This workflow is archived',
  not_published: 'Publish this workflow first',
  no_manual_trigger: 'Add a manual trigger to run this workflow',
};

export class ManualRunRefused extends Error {
  constructor(readonly reason: keyof typeof REFUSALS) {
    super(REFUSALS[reason]);
  }
}

export async function startManualWorkflowRun(input: {
  client: SupabaseClient<Database>;
  workflowId: string;
  requestId: string;
}): Promise<{ runId: string }> {
  const {
    data: { user },
  } = await input.client.auth.getUser();
  const { data: workflow } = await input.client
    .from('workflow')
    .select('account_id, archived_at')
    .eq('id', input.workflowId)
    .single()
    .throwOnError();
  const { data: canManage } = await input.client
    .rpc('has_permission', {
      user_id: user!.id,
      account_id: workflow.account_id,
      permission_name: 'workflows.manage',
    })
    .throwOnError();

  if (!canManage) {
    throw new ManualRunRefused('not_permitted');
  }
  if (workflow.archived_at !== null) {
    throw new ManualRunRefused('archived');
  }

  const admin = getSupabaseServerAdminClient();
  const { data: version } = await admin
    .from('workflow_version')
    .select('id, schema_version, graph')
    .eq('workflow_id', input.workflowId)
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle()
    .throwOnError();

  if (!version) {
    throw new ManualRunRefused('not_published');
  }

  const manualTrigger = parseWorkflowGraph({
    schemaVersion: version.schema_version,
    graph: version.graph,
  }).triggers.find((trigger) => trigger.type === 'manual_trigger');

  if (!manualTrigger) {
    throw new ManualRunRefused('no_manual_trigger');
  }

  return startWorkflowRun({
    accountId: workflow.account_id,
    workflowId: input.workflowId,
    versionId: version.id,
    triggerKind: 'manual',
    triggerRef: input.requestId,
    triggerNodeId: manualTrigger.id,
  });
}

export async function startWorkflowRun(input: {
  accountId: string;
  workflowId: string;
  versionId: string;
  triggerKind: Enums<'workflow_trigger_kind'>;
  triggerRef: string;
  triggerNodeId: string;
}): Promise<{ runId: string }> {
  const admin = getSupabaseServerAdminClient();
  const { data: inserted } = await admin
    .from('workflow_run')
    .upsert(
      {
        account_id: input.accountId,
        workflow_id: input.workflowId,
        version_id: input.versionId,
        trigger_kind: input.triggerKind,
        trigger_ref: input.triggerRef,
        trigger_node_id: input.triggerNodeId,
      },
      { onConflict: 'workflow_id,trigger_ref', ignoreDuplicates: true },
    )
    .select('id')
    .throwOnError();
  const { data: run } = await admin
    .from('workflow_run')
    .select('id')
    .eq('workflow_id', input.workflowId)
    .eq('trigger_ref', input.triggerRef)
    .single()
    .throwOnError();

  await startRunner(run.id, 'USE_EXISTING', async () => {
    await admin
      .from('workflow_run')
      .delete()
      .in(
        'id',
        inserted.map((row) => row.id),
      )
      .throwOnError();
  });

  return { runId: run.id };
}

export type ScheduledRunRefusal = 'archived' | 'disabled' | 'superseded' | 'team_locked';

export async function startScheduledRun(input: {
  accountId: string;
  workflowId: string;
  versionId: string;
  triggerRef: string;
  triggerNodeId: string;
}): Promise<{ runId: string } | { refused: ScheduledRunRefusal }> {
  const admin = getSupabaseServerAdminClient();
  const { data: workflow } = await admin
    .from('workflow')
    .select('enabled, archived_at')
    .eq('account_id', input.accountId)
    .eq('id', input.workflowId)
    .single()
    .throwOnError();
  const { data: latest } = await admin
    .from('workflow_version')
    .select('id')
    .eq('workflow_id', input.workflowId)
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false })
    .limit(1)
    .single()
    .throwOnError();

  if (workflow.archived_at !== null) {
    return { refused: 'archived' };
  }
  if (!workflow.enabled) {
    return { refused: 'disabled' };
  }
  if (latest.id !== input.versionId) {
    return { refused: 'superseded' };
  }
  if (await isTeamLocked({ accountId: input.accountId })) {
    return { refused: 'team_locked' };
  }
  return startWorkflowRun({ ...input, triggerKind: 'schedule' });
}

const RUN_ACTION_REFUSALS = {
  runner_unreachable: "Couldn't reach the runner, try again",
  step_data_removed:
    'Step data was removed after 90 days. Run the workflow again instead.',
  run_changed: 'This run already changed. Refresh to see its status.',
  run_never_started: 'This run never started. Fix the workflow, then run it again.',
};

export class RunActionRefused extends Error {
  constructor(readonly reason: keyof typeof RUN_ACTION_REFUSALS) {
    super(RUN_ACTION_REFUSALS[reason]);
  }
}

async function startRunner(
  runId: string,
  conflictPolicy: 'USE_EXISTING' | 'FAIL',
  undo: () => Promise<void>,
): Promise<void> {
  const requestedAt = new Date();
  const workflowId = workflowRunWorkflowId(runId);

  try {
    const temporal = await getTemporalClient();
    await temporal.workflow.start('runPublishedWorkflow', {
      taskQueue: TASK_QUEUE,
      workflowId,
      workflowIdConflictPolicy: conflictPolicy,
      args: [{ runId } satisfies RunPublishedWorkflowInput],
    });
  } catch (error) {
    console.error(`Starting the runner for workflow run ${runId} failed`, error);
    if (!(await runnerStartedSince(workflowId, requestedAt))) {
      await undo();
      throw new RunActionRefused('runner_unreachable');
    }
  }
}

async function runnerStartedSince(workflowId: string, since: Date): Promise<boolean> {
  return (await getTemporalClient()).workflow
    .getHandle(workflowId)
    .describe()
    .then((execution) => execution.startTime >= since)
    .catch(() => false);
}

export function stepDataRemoved(
  steps: { status: Enums<'workflow_step_status'>; output: unknown }[],
): boolean {
  return steps.some((step) => step.status === 'succeeded' && step.output === null);
}

export async function retryWorkflowRun(input: {
  accountId: string;
  runId: string;
}): Promise<void> {
  const admin = getSupabaseServerAdminClient();
  const { data: run } = await admin
    .from('workflow_run')
    .select('finished_at, error, workflow_step_run(status, output)')
    .eq('account_id', input.accountId)
    .eq('id', input.runId)
    .eq('status', 'failed')
    .maybeSingle()
    .throwOnError();

  if (!run) {
    throw new RunActionRefused('run_changed');
  }
  if (run.error !== null && run.workflow_step_run.length === 0) {
    throw new RunActionRefused('run_never_started');
  }
  if (stepDataRemoved(run.workflow_step_run)) {
    throw new RunActionRefused('step_data_removed');
  }

  const { data: reopened } = await admin
    .from('workflow_run')
    .update({ status: 'running', finished_at: null, error: null })
    .eq('id', input.runId)
    .eq('status', 'failed')
    .select('id')
    .throwOnError();

  if (reopened.length === 0) {
    throw new RunActionRefused('run_changed');
  }
  await startRunner(input.runId, 'FAIL', async () => {
    await admin
      .from('workflow_run')
      .update({ status: 'failed', finished_at: run.finished_at })
      .eq('id', input.runId)
      .eq('status', 'running')
      .throwOnError();
  });
}

export const UNFINISHED_RUN_STATUSES = [
  'running',
  'waiting',
  'awaiting_approval',
  'paused_locked',
  'paused_cap',
] as const satisfies readonly Enums<'workflow_run_status'>[];

const PARKED_RUN_STATUSES = UNFINISHED_RUN_STATUSES.filter(
  (status) => status !== 'running',
);

async function cancelRuns(
  runIds: string[],
): Promise<{ cancelled: string[]; unreached: number }> {
  const temporal = getTemporalClient();
  const stops = await Promise.allSettled(
    runIds.map(async (runId) =>
      (await temporal).workflow
        .getHandle(workflowRunWorkflowId(runId))
        .cancel()
        .catch((error: unknown) => {
          if (!(error instanceof WorkflowNotFoundError)) {
            throw error;
          }
        }),
    ),
  );
  const stopped = runIds.filter((_, index) => stops[index]!.status === 'fulfilled');

  const { data: cancelled } = await getSupabaseServerAdminClient()
    .from('workflow_run')
    .update({ status: 'cancelled', finished_at: new Date().toISOString() })
    .in('id', stopped)
    .in('status', UNFINISHED_RUN_STATUSES)
    .select('id')
    .throwOnError();

  return {
    cancelled: cancelled.map((run) => run.id),
    unreached: runIds.length - stopped.length,
  };
}

export async function cancelWorkflowRun(input: {
  accountId: string;
  runId: string;
}): Promise<void> {
  const { data: runs } = await getSupabaseServerAdminClient()
    .from('workflow_run')
    .select('id')
    .eq('account_id', input.accountId)
    .eq('id', input.runId)
    .in('status', UNFINISHED_RUN_STATUSES)
    .throwOnError();

  if (runs.length === 0) {
    throw new RunActionRefused('run_changed');
  }
  const { cancelled, unreached } = await cancelRuns([input.runId]);

  if (unreached > 0) {
    throw new RunActionRefused('runner_unreachable');
  }
  if (cancelled.length === 0) {
    throw new RunActionRefused('run_changed');
  }
}

export async function cancelWaitingRuns(input: {
  accountId: string;
  workflowId: string;
}): Promise<{ cancelled: number; unreached: number }> {
  const admin = getSupabaseServerAdminClient();
  const { data: latest } = await admin
    .from('workflow_version')
    .select('id')
    .eq('account_id', input.accountId)
    .eq('workflow_id', input.workflowId)
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle()
    .throwOnError();

  if (!latest) {
    return { cancelled: 0, unreached: 0 };
  }

  const { data: runs } = await admin
    .from('workflow_run')
    .select('id')
    .eq('account_id', input.accountId)
    .eq('workflow_id', input.workflowId)
    .neq('version_id', latest.id)
    .in('status', PARKED_RUN_STATUSES)
    .throwOnError();
  const { cancelled, unreached } = await cancelRuns(runs.map((run) => run.id));

  return { cancelled: cancelled.length, unreached };
}

export async function resumeLockedWorkflowRuns(input: {
  accountId: string;
}): Promise<void> {
  const { data: runs } = await getSupabaseServerAdminClient()
    .from('workflow_run')
    .select('id')
    .eq('account_id', input.accountId)
    .eq('status', 'paused_locked')
    .throwOnError();
  const temporal = await getTemporalClient();
  const signals = await Promise.allSettled(
    runs.map((run) =>
      temporal.workflow
        .getHandle(workflowRunWorkflowId(run.id))
        .signal(TEAM_UNLOCKED_SIGNAL),
    ),
  );

  signals.forEach((signal, index) => {
    if (signal.status === 'rejected') {
      console.error(
        `Waking workflow run ${runs[index]!.id} after unlock failed`,
        signal.reason,
      );
    }
  });
}
