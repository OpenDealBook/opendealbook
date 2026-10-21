import { ApplicationFailure } from '@temporalio/common';
import { z } from 'zod';

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
  NODE_CONFIG_SCHEMAS,
  parseWorkflowGraph,
  WORKFLOW_GRAPH_SCHEMA_VERSIONS,
  type NodeConfig,
  type NodeTypeName,
  type RunnableGraph,
  type StepIo,
  type WorkflowNode,
} from './graph';
import { UNFINISHED_RUN_STATUSES } from './client';
import { stepRegistry } from './registry';
import { evaluateRule } from './rules';
import { teamTimezone } from './team-timezone';
import { validateWorkflowGraph } from './validate';
import { wakeAt } from './wait';

type RunStatus = Enums<'workflow_run_status'>;

const FINISHED_RUN_STATUSES: ReadonlySet<RunStatus> = new Set([
  'succeeded',
  'failed',
  'cancelled',
]);

export type LoadedWorkflowRun =
  | { kind: 'runnable'; accountId: string; triggerNodeId: string; graph: RunnableGraph }
  | { kind: 'refused' };

function graphProblem(version: { schema_version: number; graph: Json }): string | null {
  if (!(WORKFLOW_GRAPH_SCHEMA_VERSIONS as readonly number[]).includes(version.schema_version)) {
    return `Schema version ${version.schema_version} is not supported`;
  }
  let graph: RunnableGraph;
  try {
    graph = parseWorkflowGraph({ schemaVersion: version.schema_version, graph: version.graph });
  } catch {
    return 'The workflow graph could not be read';
  }
  const validation = validateWorkflowGraph(graph);
  return validation.ok ? null : validation.errors[0]!.message;
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
  const problem = graphProblem(run.workflow_version);

  if (problem !== null) {
    await transitionWorkflowRun({ runId: input.runId, from: 'running', to: 'failed', error: problem });
    return { kind: 'refused' };
  }
  return {
    kind: 'runnable',
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
  error?: string;
}): Promise<void> {
  await getSupabaseServerAdminClient()
    .from('workflow_run')
    .update({
      status: input.to,
      finished_at: FINISHED_RUN_STATUSES.has(input.to) ? new Date().toISOString() : null,
      error: input.error,
    })
    .eq('id', input.runId)
    .eq('status', input.from)
    .throwOnError();
  if (input.to === 'failed') {
    await notifyRunFailed(input.runId);
  }
}

export async function failWorkflowRun(input: { runId: string; error: string }): Promise<void> {
  await getSupabaseServerAdminClient()
    .from('workflow_run')
    .update({ status: 'failed', finished_at: new Date().toISOString(), error: input.error })
    .eq('id', input.runId)
    .in('status', UNFINISHED_RUN_STATUSES)
    .throwOnError();
  await notifyRunFailed(input.runId);
}

async function notifyRunFailed(runId: string): Promise<void> {
  const admin = getSupabaseServerAdminClient();
  const { data: run } = await admin
    .from('workflow_run')
    .select(
      'account_id, workflow_id, error, accounts(slug), workflow(name), workflow_version(schema_version, graph), workflow_step_run(node_id)',
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
  const [failedStepRun] = run.workflow_step_run;
  const failedNode =
    failedStepRun &&
    parseWorkflowGraph({
      schemaVersion: run.workflow_version.schema_version,
      graph: run.workflow_version.graph,
    }).nodes.find((node) => node.id === failedStepRun.node_id)!;
  const message = failedNode
    ? `${run.workflow.name} failed at ${failedNode.label ?? failedNode.id}`
    : `${run.workflow.name} failed: ${run.error}`;
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
  node: WorkflowNode;
  iterationPath: readonly number[];
}

function stepKey(execution: StepExecution): string {
  const iteration = execution.iterationPath.join('.') || '0';
  return `${execution.runId}:${execution.node.id}:${iteration}`;
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

export interface LoopResume {
  nodeId: string;
  items: Json[];
  context: { input: StepIo; steps: StepOutputs };
  complete: boolean;
}

export interface LoopCarried {
  items: Json[];
  context: { input: StepIo; steps: StepOutputs };
}

export interface LoopGrant {
  items: Json[];
  saved: number;
  carried: LoopCarried[];
  resumes: LoopResume[];
  released: string[];
}

export type StepResult =
  | {
      kind: 'succeeded';
      output: StepIo;
      handle?: string;
      loop?: LoopGrant;
    }
  | { kind: 'waiting'; until: string }
  | { kind: 'run_cancelled' };

const stepIoSchema = z.record(z.string(), z.json());
const loopContextSchema = z.object({
  input: stepIoSchema,
  steps: z.record(z.string(), stepIoSchema),
});
const loopOutputSchema = z
  .object({
    items: z.array(z.json()),
    saved: z.number(),
    carried: z.array(z.object({ items: z.array(z.json()), context: loopContextSchema })),
    resumes: z.array(
      z.object({
        nodeId: z.string(),
        items: z.array(z.json()),
        context: loopContextSchema,
        complete: z.boolean(),
      }),
    ),
    released: z.array(z.string()),
  })
  .loose();

function controlConfig<Type extends NodeTypeName>(
  type: Type,
  config: Json,
): NodeConfig<Type> {
  const parsed = NODE_CONFIG_SCHEMAS[type].safeParse(config);
  if (!parsed.success) {
    throw ApplicationFailure.nonRetryable(parsed.error.message);
  }
  return parsed.data as NodeConfig<Type>;
}

function chosenHandle(node: WorkflowNode, input: StepIo, steps: StepOutputs): string | undefined {
  if (node.type !== 'branch') {
    return undefined;
  }
  const { rule } = controlConfig('branch', node.config);
  try {
    return String(evaluateRule(rule, { input, steps }));
  } catch (error) {
    throw ApplicationFailure.nonRetryable((error as Error).message);
  }
}

function storedResult(
  node: WorkflowNode,
  output: Json,
  input: StepIo,
  steps: StepOutputs,
): StepResult {
  if (node.type in stepRegistry) {
    return {
      kind: 'succeeded',
      output: stepRegistry[node.type as keyof typeof stepRegistry].outputSchema.parse(output),
    };
  }
  return {
    kind: 'succeeded',
    output: stepIoSchema.parse(output),
    handle: chosenHandle(node, input, steps),
    loop: node.type === 'loop' ? loopOutputSchema.parse(output) : undefined,
  };
}

async function runInstantNode(
  input: StepExecution & { input: StepIo; steps: StepOutputs; idempotencyKey: string },
): Promise<StepIo> {
  if (input.node.type in stepRegistry) {
    return stepRegistry[input.node.type as keyof typeof stepRegistry].execute({
      context: {
        accountId: input.accountId,
        runId: input.runId,
        idempotencyKey: input.idempotencyKey,
      },
      config: resolveExpressions(input.node.config, input.steps),
      input: input.input,
    });
  }
  return input.input;
}

async function settledElsewhere(
  node: WorkflowNode,
  stepRunId: string,
  input: StepIo,
  steps: StepOutputs,
): Promise<StepResult> {
  const { data: stepRun } = await getSupabaseServerAdminClient()
    .from('workflow_step_run')
    .select('status, output, workflow_run(status)')
    .eq('id', stepRunId)
    .single()
    .throwOnError();

  if (stepRun.status === 'succeeded') {
    return storedResult(node, stepRun.output, input, steps);
  }
  if (stepRun.workflow_run.status === 'cancelled') {
    return { kind: 'run_cancelled' };
  }
  throw new Error(`Step run ${stepRunId} became ${stepRun.status} while it ran`);
}

async function finishStep(
  execution: StepExecution & { input: StepIo; steps: StepOutputs },
  stepRunId: string,
  output: StepIo,
): Promise<boolean> {
  const { data: finished } = await getSupabaseServerAdminClient()
    .from('workflow_step_run')
    .update({ status: 'succeeded', output, finished_at: new Date().toISOString() })
    .eq('id', stepRunId)
    .in('status', ['running', 'waiting'])
    .select('id')
    .throwOnError();
  if (finished.length === 0) {
    return false;
  }
  await logStep({
    accountId: execution.accountId,
    stepRunId,
    level: 'info',
    message: 'Step succeeded',
    details: { output },
  });
  return true;
}

async function continueWait(
  execution: StepExecution & { input: StepIo; steps: StepOutputs },
  stepRun: { id: string; status: string; wake_at: string | null },
): Promise<StepResult> {
  const until =
    stepRun.status === 'waiting'
      ? new Date(stepRun.wake_at!)
      : wakeAt(
          controlConfig('wait', resolveExpressions(execution.node.config, execution.steps)),
          new Date(),
          await teamTimezone(execution.accountId),
        );

  if (until > new Date()) {
    if (stepRun.status === 'running') {
      const { data: parked } = await getSupabaseServerAdminClient()
        .from('workflow_step_run')
        .update({ status: 'waiting', wake_at: until.toISOString() })
        .eq('id', stepRun.id)
        .eq('status', 'running')
        .select('id')
        .throwOnError();
      if (parked.length === 0) {
        return settledElsewhere(execution.node, stepRun.id, execution.input, execution.steps);
      }
      await logStep({
        accountId: execution.accountId,
        stepRunId: stepRun.id,
        level: 'info',
        message: 'Step waiting',
        details: { until: until.toISOString() },
      });
    }
    return { kind: 'waiting', until: until.toISOString() };
  }
  return (await finishStep(execution, stepRun.id, execution.input))
    ? { kind: 'succeeded', output: execution.input }
    : settledElsewhere(execution.node, stepRun.id, execution.input, execution.steps);
}

export async function executeWorkflowStep(
  input: StepExecution & { input: StepIo; steps: StepOutputs; rootLoopId?: string },
): Promise<StepResult> {
  const client = getSupabaseServerAdminClient();
  const idempotencyKey = stepKey(input);
  const { data: started } = await client
    .rpc('start_workflow_step_run', {
      p_account_id: input.accountId,
      p_run_id: input.runId,
      p_node_id: input.node.id,
      p_idempotency_key: idempotencyKey,
      p_iteration_path: [...input.iterationPath],
      p_input: input.input,
    })
    .throwOnError();
  const [stepRun] = started;

  if (stepRun?.status === 'succeeded') {
    return storedResult(input.node, stepRun.output, input.input, input.steps);
  }
  if (stepRun?.status === 'waiting') {
    return continueWait(input, stepRun);
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

  if (input.node.type === 'wait') {
    return continueWait(input, stepRun);
  }
  if (input.node.type === 'loop') {
    const { items } = controlConfig('loop', resolveExpressions(input.node.config, input.steps));
    const { data: output } = await client
      .rpc('grant_workflow_loop_items', {
        p_step_run_id: stepRun.id,
        p_root_node_id: input.rootLoopId ?? input.node.id,
        p_items: items,
        p_context: { input: input.input, steps: input.steps },
      })
      .throwOnError();
    return output === null
      ? settledElsewhere(input.node, stepRun.id, input.input, input.steps)
      : storedResult(input.node, output, input.input, input.steps);
  }

  const handle = chosenHandle(input.node, input.input, input.steps);
  const output = await runInstantNode({ ...input, idempotencyKey });

  return (await finishStep(input, stepRun.id, output))
    ? { kind: 'succeeded', output, handle }
    : settledElsewhere(input.node, stepRun.id, input.input, input.steps);
}

export async function failWorkflowStep(
  input: StepExecution & { error: string },
): Promise<void> {
  const admin = getSupabaseServerAdminClient();
  const failure = {
    status: 'failed' as const,
    error: input.error,
    finished_at: new Date().toISOString(),
  };
  const { data: updated } = await admin
    .from('workflow_step_run')
    .update(failure)
    .eq('idempotency_key', stepKey(input))
    .in('status', ['running', 'waiting', 'failed'])
    .select('id')
    .throwOnError();
  const { data: inserted } =
    updated.length > 0
      ? { data: updated }
      : await admin
          .from('workflow_step_run')
          .upsert(
            {
              account_id: input.accountId,
              run_id: input.runId,
              node_id: input.node.id,
              idempotency_key: stepKey(input),
              iteration_path: [...input.iterationPath],
              ...failure,
            },
            { onConflict: 'idempotency_key', ignoreDuplicates: true },
          )
          .select('id')
          .throwOnError();
  const [stepRun] = inserted;

  if (!stepRun) {
    return;
  }
  await logStep({
    accountId: input.accountId,
    stepRunId: stepRun.id,
    level: 'error',
    message: 'Step failed',
    details: { error: input.error },
  });
}

export async function releaseLoopItems(input: {
  runId: string;
  rootNodeId: string;
  units: { nodeId: string; context: LoopCarried['context']; items: { item: Json; path: string }[] }[];
}): Promise<void> {
  const admin = getSupabaseServerAdminClient();
  const { data: rootStep } = await admin
    .from('workflow_step_run')
    .select('id, output, workflow_run(account_id, workflow_id)')
    .eq('idempotency_key', `${input.runId}:${input.rootNodeId}:0`)
    .single()
    .throwOnError();
  const output = loopOutputSchema.parse(rootStep.output);
  const alreadyReleased = new Set(output.released);
  const units = input.units
    .map((unit) => ({
      ...unit,
      items: unit.items.filter((entry) => !alreadyReleased.has(entry.path)),
    }))
    .filter((unit) => unit.items.length > 0);

  if (units.length === 0) {
    return;
  }
  await admin
    .from('workflow_loop_saved_work')
    .insert(
      units.map((unit) => ({
        account_id: rootStep.workflow_run.account_id,
        workflow_id: rootStep.workflow_run.workflow_id,
        root_node_id: input.rootNodeId,
        node_id: unit.nodeId,
        items: unit.items.map((entry) => entry.item),
        context: unit.context,
        saved_by_run_id: input.runId,
      })),
    )
    .throwOnError();
  await admin
    .from('workflow_step_run')
    .update({
      output: {
        ...output,
        released: [
          ...output.released,
          ...units.flatMap((unit) => unit.items.map((entry) => entry.path)),
        ],
      },
    })
    .eq('id', rootStep.id)
    .throwOnError();
}
