import {
  createNovuClient,
  RUN_FAILED_NOTICE_EVENT,
  triggerNotification,
} from '@odb/notifications/server';
import type { Enums, Json } from '@odb/supabase';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { dealManagerIds } from '../dealManagers';
import { resolveExpressions, type StepOutputs } from './expressions';
import {
  parseWorkflowGraph,
  stepIdempotencyKey,
  type RunnableGraph,
  type StepIo,
  type StepNode,
} from './graph';
import { stepRegistry } from './registry';

type RunStatus = Enums<'workflow_run_status'>;

const FINISHED_RUN_STATUSES: ReadonlySet<RunStatus> = new Set([
  'succeeded',
  'failed',
  'cancelled',
]);

export interface LoadedWorkflowRun {
  accountId: string;
  triggerNodeId: string;
  graph: RunnableGraph;
}

export async function loadWorkflowRun(input: {
  runId: string;
}): Promise<LoadedWorkflowRun> {
  const { data: run } = await getSupabaseServerAdminClient()
    .from('workflow_run')
    .select('account_id, trigger_node_id, workflow_version(schema_version, graph)')
    .eq('id', input.runId)
    .single()
    .throwOnError();

  return {
    accountId: run.account_id,
    triggerNodeId: run.trigger_node_id,
    graph: parseWorkflowGraph({
      schemaVersion: run.workflow_version.schema_version,
      graph: run.workflow_version.graph,
    }),
  };
}

export async function transitionWorkflowRun(input: {
  runId: string;
  from: RunStatus;
  to: RunStatus;
}): Promise<void> {
  await getSupabaseServerAdminClient()
    .from('workflow_run')
    .update({
      status: input.to,
      finished_at: FINISHED_RUN_STATUSES.has(input.to)
        ? new Date().toISOString()
        : null,
    })
    .eq('id', input.runId)
    .eq('status', input.from)
    .throwOnError();
  if (input.to === 'failed') {
    await notifyRunFailed(input.runId);
  }
}

async function notifyRunFailed(runId: string): Promise<void> {
  const admin = getSupabaseServerAdminClient();
  const { data: run } = await admin
    .from('workflow_run')
    .select(
      'account_id, workflow_id, accounts(slug), workflow(name), workflow_version(schema_version, graph), workflow_step_run(node_id)',
    )
    .eq('id', runId)
    .eq('status', 'failed')
    .eq('workflow_step_run.status', 'failed')
    .order('finished_at', { referencedTable: 'workflow_step_run' })
    .limit(1, { referencedTable: 'workflow_step_run' })
    .maybeSingle()
    .throwOnError();

  if (!run) {
    return;
  }
  const failedStep = parseWorkflowGraph({
    schemaVersion: run.workflow_version.schema_version,
    graph: run.workflow_version.graph,
  }).steps.find((node) => node.id === run.workflow_step_run[0]!.node_id)!;
  const message = `${run.workflow.name} failed at ${failedStep.label ?? failedStep.id}`;
  const path = `/home/${run.accounts.slug}/workflows/${run.workflow_id}/runs/${runId}`;
  const dedupeKey = (userId: string) => `workflow_run_failed:${runId}:${userId}`;
  const recipients = await dealManagerIds(run.account_id);

  await admin
    .from('notifications')
    .upsert(
      recipients.map((userId) => ({
        account_id: run.account_id,
        recipient_user_id: userId,
        type: 'error' as const,
        body: message,
        link: path,
        dedupe_key: dedupeKey(userId),
      })),
      { onConflict: 'dedupe_key', ignoreDuplicates: true },
    )
    .throwOnError();

  if (!process.env.NOVU_API_KEY || !process.env.NOVU_API_URL) {
    return;
  }
  const { data: personalAccounts } = await admin
    .from('accounts')
    .select('primary_owner_user_id, email')
    .eq('is_personal_account', true)
    .in('primary_owner_user_id', recipients)
    .throwOnError();
  const novu = createNovuClient();
  for (const { primary_owner_user_id: userId, email } of personalAccounts) {
    await triggerNotification(
      { novu, client: admin },
      {
        eventType: RUN_FAILED_NOTICE_EVENT,
        recipientUserId: userId,
        email: email ?? undefined,
        payload: { message, path },
        transactionId: dedupeKey(userId),
      },
    );
  }
}

interface StepExecution {
  runId: string;
  accountId: string;
  node: StepNode;
  iteration: number;
}

async function logStep(input: {
  accountId: string;
  stepRunId: string;
  level: Enums<'workflow_log_level'>;
  message: string;
  details: Json;
}): Promise<void> {
  await getSupabaseServerAdminClient()
    .from('workflow_step_log')
    .insert({
      account_id: input.accountId,
      step_run_id: input.stepRunId,
      level: input.level,
      message: input.message,
      details: input.details,
    })
    .throwOnError();
}

export type StepResult =
  | { kind: 'succeeded'; output: StepIo }
  | { kind: 'run_cancelled' };

export async function executeWorkflowStep(
  input: StepExecution & { input: StepIo; steps: StepOutputs },
): Promise<StepResult> {
  const client = getSupabaseServerAdminClient();
  const idempotencyKey = stepIdempotencyKey({
    runId: input.runId,
    nodeId: input.node.id,
    iteration: input.iteration,
  });
  const step = stepRegistry[input.node.type];
  const { data: started } = await client
    .rpc('start_workflow_step_run', {
      p_account_id: input.accountId,
      p_run_id: input.runId,
      p_node_id: input.node.id,
      p_idempotency_key: idempotencyKey,
      p_input: input.input,
    })
    .throwOnError();
  const [stepRun] = started;

  if (stepRun?.status === 'succeeded') {
    return { kind: 'succeeded', output: step.outputSchema.parse(stepRun.output) };
  }
  if (stepRun?.status !== 'running') {
    return { kind: 'run_cancelled' };
  }
  await logStep({
    accountId: input.accountId,
    stepRunId: stepRun.id,
    level: 'info',
    message: 'Step started',
    details: { attempt: stepRun.attempt },
  });

  const output = await step.execute({
    context: { accountId: input.accountId, runId: input.runId, idempotencyKey },
    config: resolveExpressions(input.node.config, input.steps),
    input: input.input,
  });

  const { data: finished } = await client
    .from('workflow_step_run')
    .update({ status: 'succeeded', output, finished_at: new Date().toISOString() })
    .eq('id', stepRun.id)
    .eq('status', 'running')
    .select('id')
    .throwOnError();
  if (finished.length === 0) {
    return settledElsewhere(stepRun.id, step);
  }
  await logStep({
    accountId: input.accountId,
    stepRunId: stepRun.id,
    level: 'info',
    message: 'Step succeeded',
    details: { output },
  });

  return { kind: 'succeeded', output };
}

async function settledElsewhere(
  stepRunId: string,
  step: (typeof stepRegistry)[keyof typeof stepRegistry],
): Promise<StepResult> {
  const { data: stepRun } = await getSupabaseServerAdminClient()
    .from('workflow_step_run')
    .select('status, output, workflow_run(status)')
    .eq('id', stepRunId)
    .single()
    .throwOnError();

  if (stepRun.status === 'succeeded') {
    return { kind: 'succeeded', output: step.outputSchema.parse(stepRun.output) };
  }
  if (stepRun.workflow_run.status === 'cancelled') {
    return { kind: 'run_cancelled' };
  }
  throw new Error(`Step run ${stepRunId} became ${stepRun.status} while it ran`);
}

export async function failWorkflowStep(
  input: StepExecution & { error: string },
): Promise<void> {
  const { data: stepRun } = await getSupabaseServerAdminClient()
    .from('workflow_step_run')
    .upsert(
      {
        account_id: input.accountId,
        run_id: input.runId,
        node_id: input.node.id,
        idempotency_key: stepIdempotencyKey({
          runId: input.runId,
          nodeId: input.node.id,
          iteration: input.iteration,
        }),
        status: 'failed',
        error: input.error,
        finished_at: new Date().toISOString(),
      },
      { onConflict: 'idempotency_key' },
    )
    .select('id')
    .single()
    .throwOnError();
  await logStep({
    accountId: input.accountId,
    stepRunId: stepRun.id,
    level: 'error',
    message: 'Step failed',
    details: { error: input.error },
  });
}
