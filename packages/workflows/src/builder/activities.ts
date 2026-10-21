import { Context } from '@temporalio/activity';

import type { Enums, Json } from '@odb/supabase';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

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

export async function executeWorkflowStep(
  input: StepExecution & { input: StepIo; steps: StepOutputs },
): Promise<StepIo> {
  const client = getSupabaseServerAdminClient();
  const idempotencyKey = stepIdempotencyKey({
    runId: input.runId,
    nodeId: input.node.id,
    iteration: input.iteration,
  });
  const { attempt } = Context.current().info;

  const { data: stepRun } = await client
    .from('workflow_step_run')
    .upsert(
      {
        account_id: input.accountId,
        run_id: input.runId,
        node_id: input.node.id,
        idempotency_key: idempotencyKey,
        attempt,
        status: 'running',
        finished_at: null,
        input: input.input,
      },
      { onConflict: 'idempotency_key' },
    )
    .select('id')
    .single()
    .throwOnError();
  await logStep({
    accountId: input.accountId,
    stepRunId: stepRun.id,
    level: 'info',
    message: 'Step started',
    details: { attempt },
  });

  const output = await stepRegistry[input.node.type].execute({
    context: { accountId: input.accountId, runId: input.runId, idempotencyKey },
    config: resolveExpressions(input.node.config, input.steps),
    input: input.input,
  });

  await client
    .from('workflow_step_run')
    .update({ status: 'succeeded', output, finished_at: new Date().toISOString() })
    .eq('id', stepRun.id)
    .throwOnError();
  await logStep({
    accountId: input.accountId,
    stepRunId: stepRun.id,
    level: 'info',
    message: 'Step succeeded',
    details: { output },
  });

  return output;
}

export async function failWorkflowStep(
  input: StepExecution & { error: string },
): Promise<void> {
  const { data: stepRun } = await getSupabaseServerAdminClient()
    .from('workflow_step_run')
    .update({
      status: 'failed',
      error: input.error,
      finished_at: new Date().toISOString(),
    })
    .eq(
      'idempotency_key',
      stepIdempotencyKey({
        runId: input.runId,
        nodeId: input.node.id,
        iteration: input.iteration,
      }),
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
