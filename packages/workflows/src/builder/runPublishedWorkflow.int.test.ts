import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { turnTeamBillingOn } from '@odb/supabase/test-support/team-billing';

import {
  provisionAccount,
  type IntegrationAccount,
} from '../../test-support/integration-harness';

const temporal = vi.hoisted(() => ({
  open: new Set<string>(),
  startedAt: new Map<string, Date>(),
  start: vi.fn(
    async (
      _type: string,
      options: {
        workflowId: string;
        workflowIdConflictPolicy: string;
        args: [{ runId: string }];
      },
    ) => {
      if (temporal.open.has(options.workflowId)) {
        if (options.workflowIdConflictPolicy === 'USE_EXISTING') {
          return;
        }
        const { WorkflowExecutionAlreadyStartedError } = await import(
          '@temporalio/client'
        );
        throw new WorkflowExecutionAlreadyStartedError(
          'Workflow execution already started',
          options.workflowId,
          'runPublishedWorkflow',
        );
      }
      temporal.startedAt.set(options.workflowId, new Date());
    },
  ),
  signal: vi.fn(async (_workflowId: string, _signal: string) => undefined),
  cancel: vi.fn(async (_workflowId: string) => undefined),
  onWait: async () => {},
  slept: [] as number[],
  onSleep: async (_ms: number) => {},
  fault: async (_activity: string, _input: unknown) => {},
  timeouts: [] as [string, string, string | undefined][],
  conditionTimeouts: [] as (number | string | undefined)[],
}));

const managers = vi.hoisted(() => ({ beforeLookup: async () => {} }));

const activityContext = vi.hoisted(() => ({
  cancellation: new AbortController(),
  heartbeat: vi.fn(),
  seenSignals: [] as AbortSignal[],
}));

vi.mock('@temporalio/activity', () => ({
  Context: {
    current: () => ({
      cancellationSignal: activityContext.cancellation.signal,
      heartbeat: activityContext.heartbeat,
    }),
  },
}));

vi.mock('../dealManagers', async (importOriginal) => {
  const { dealManagerIds } = await importOriginal<typeof import('../dealManagers')>();
  return {
    dealManagerIds: async (accountId: string) => {
      await managers.beforeLookup();
      return dealManagerIds(accountId);
    },
  };
});

vi.mock('./registry', async (importOriginal) => {
  const { stepRegistry } = await importOriginal<typeof import('./registry')>();
  const { defineStep } = await import('./step');
  const { reserveAiCall } = await import('./caps');
  const { z } = await import('zod');
  return {
    stepRegistry: {
      ...stepRegistry,
      approval: defineStep({
        type: 'approval',
        runOnce: false,
        configSchema: z.object({ prompt: z.string() }),
        inputSchema: z.object({}),
        outputSchema: z.object({ asked: z.boolean() }),
        async run() {
          return { asked: true };
        },
      }),
      ask_ai: defineStep({
        type: 'ask_ai',
        runOnce: false,
        configSchema: z.record(z.string(), z.json()),
        inputSchema: z.object({}),
        outputSchema: z.object({ text: z.string() }),
        async run({ context }) {
          activityContext.seenSignals.push(context.signal!);
          return { text: 'A short summary' };
        },
      }),
      decision_model: defineStep({
        type: 'decision_model',
        runOnce: false,
        configSchema: z.record(z.string(), z.json()),
        inputSchema: z.object({}),
        outputSchema: z.object({ verdictId: z.string(), fit: z.boolean() }),
        async run({ context }) {
          const { data: endpoint } = await (await import('@odb/supabase/admin'))
            .getSupabaseServerAdminClient()
            .from('llm_endpoint')
            .select('id, chat_model')
            .eq('account_id', context.accountId)
            .single()
            .throwOnError();
          await reserveAiCall(context.accountId, {
            model: endpoint.chat_model!,
            endpointId: endpoint.id,
          });
          return { verdictId: 'a7000000-0000-4000-8000-000000000001', fit: true };
        },
      }),
      create_todo: defineStep({
        type: 'create_todo',
        runOnce: false,
        configSchema: z.record(z.string(), z.json()),
        inputSchema: z.object({}),
        outputSchema: z.object({ spent: z.boolean() }),
        async run({ context }) {
          await reserveAiCall(context.accountId, { model: 'test-model', endpointId: null });
          return { spent: true };
        },
      }),
    },
  };
});

const novu = vi.hoisted(() => ({
  trigger: vi.fn(async (_workflowId: string, _data: unknown) => undefined),
  subscribers: { identify: async () => undefined },
}));

vi.mock('../client', () => ({
  TASK_QUEUE: 'opendealbook',
  getTemporalClient: async () => ({
    workflow: {
      start: temporal.start,
      getHandle: (workflowId: string) => ({
        signal: (signal: string) => temporal.signal(workflowId, signal),
        cancel: () => temporal.cancel(workflowId),
        describe: async () => {
          const startTime = temporal.startedAt.get(workflowId);
          if (!startTime) {
            const { WorkflowNotFoundError } = await import('@temporalio/client');
            throw new WorkflowNotFoundError('not found', workflowId, undefined);
          }
          return { startTime };
        },
      }),
    },
  }),
}));

vi.mock('@odb/notifications/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@odb/notifications/server')>()),
  createNovuClient: () => novu,
}));

vi.mock('@temporalio/workflow', async () => {
  const builderActivities = await import('./activities');
  const { isTeamLocked } = await import('../teamLock');
  const { notifyApprovalWaiting } = await import('./approvalNotice');

  const faulted = Object.fromEntries(
    Object.entries({ ...builderActivities, isTeamLocked, notifyApprovalWaiting }).map(([name, activity]) => [
      name,
      async (input: unknown) => {
        await temporal.fault(name, input);
        return (activity as (input: unknown) => unknown)(input);
      },
    ]),
  );

  return {
    proxyActivities: (options: { startToCloseTimeout: string; heartbeatTimeout?: string }) =>
      Object.fromEntries(
        Object.entries(faulted).map(([name, activity]) => [
          name,
          async (input: unknown) => {
            temporal.timeouts.push([name, options.startToCloseTimeout, options.heartbeatTimeout]);
            return activity(input);
          },
        ]),
      ),
    CancellationScope: { nonCancellable: <T>(fn: () => Promise<T>) => fn() },
    log: { warn: () => {} },
    isCancellation: () => false,
    defineSignal: (name: string) => name,
    setHandler: () => {},
    condition: async (_predicate: () => boolean, timeout?: number | string) => {
      temporal.conditionTimeouts.push(timeout);
      await temporal.onWait();
      return false;
    },
    sleep: async (ms: number) => {
      temporal.slept.push(ms);
      await temporal.onSleep(ms);
      vi.setSystemTime(Date.now() + ms);
    },
  };
});

import { WorkflowNotFoundError } from '@temporalio/client';
import { ApplicationFailure } from '@temporalio/common';

import {
  executeWorkflowStep,
  failWorkflowStep,
  notifyRunFailed,
  transitionWorkflowRun,
} from './activities';
import type { WorkflowNode } from './graph';

type NodeConfigValue = WorkflowNode['config'][string];
import {
  aiProviderProblem,
  cancelWaitingRuns,
  cancelWorkflowRun,
  ManualRunRefused,
  resumeLockedWorkflowRuns,
  resumeCappedRuns,
  retryWorkflowRun,
  RunActionRefused,
  signalApprovalDecided,
  startEventRun,
  startManualWorkflowRun,
} from './client';
import { CapReached, recordAiCallUsage, reserveAiCall } from './caps';
import type { WorkflowGraph } from './graph';
import { runPublishedWorkflow } from './workflow';

const HOUR = 60 * 60 * 1000;
const RUNTIME_FAILURE = '{{steps.start.missing}}';
const message = 'Weekly pipeline review is due';

let owner: IntegrationAccount;
let teamId: string;
let teamSlug: string;
let managerId: string;
let memberId: string;
let workflowId: string;

const trigger = { id: 'start', type: 'manual_trigger', config: {} } as const;
const edge = (sourceNodeId: string, targetNodeId: string) => ({
  id: `${sourceNodeId}-${targetNodeId}`,
  sourceNodeId,
  targetNodeId,
});
const oneStepGraph: WorkflowGraph = {
  nodes: [trigger, { id: 'notify', type: 'notify_team', config: { message } }],
  edges: [edge('start', 'notify')],
};

async function createUser(label: string): Promise<string> {
  const { data } = await owner.admin.auth.admin.createUser({
    email: `int-wfb-${label}-${crypto.randomUUID().slice(0, 8)}@odb.test`,
    email_confirm: true,
  });
  return data.user!.id;
}

async function publish(graph: WorkflowGraph): Promise<void> {
  await owner.admin
    .from('workflow_version')
    .insert({
      account_id: teamId,
      workflow_id: workflowId,
      schema_version: 1,
      graph,
      published_at: new Date().toISOString(),
      published_by: owner.userId,
    })
    .throwOnError();
}

async function notificationCounts(
  body: string = message,
): Promise<Record<string, number>> {
  const { data } = await owner.admin
    .from('notifications')
    .select('recipient_user_id')
    .eq('account_id', teamId)
    .eq('body', body)
    .throwOnError();
  const counts: Record<string, number> = {};
  for (const row of data) {
    counts[row.recipient_user_id] = (counts[row.recipient_user_id] ?? 0) + 1;
  }
  return counts;
}

async function runRow(runId: string) {
  const { data } = await owner.admin
    .from('workflow_run')
    .select('status, finished_at')
    .eq('id', runId)
    .single()
    .throwOnError();
  return data;
}

async function stepRows(runId: string) {
  const { data } = await owner.admin
    .from('workflow_step_run')
    .select(
      'node_id, status, attempt, error, idempotency_key, workflow_step_log(level, message)',
    )
    .eq('run_id', runId)
    .order('node_id')
    .order('created_at', { referencedTable: 'workflow_step_log' })
    .throwOnError();
  return data;
}

async function runManually(): Promise<{ runId: string }> {
  temporal.start.mockClear();
  await startManualWorkflowRun({
    client: owner.user,
    workflowId,
    requestId: crypto.randomUUID(),
  });
  expect(temporal.start).toHaveBeenCalledTimes(1);
  const [type, options] = temporal.start.mock.calls[0]!;
  const { args, workflowId: temporalWorkflowId } = options;
  expect(type).toBe('runPublishedWorkflow');
  expect(args).toEqual([{ runId: expect.any(String) }]);
  expect(temporalWorkflowId).toBe(`workflow-run-${args[0].runId}`);
  return args[0];
}

async function lockTeam(): Promise<() => Promise<void>> {
  await turnTeamBillingOn(owner.admin);
  await owner.admin
    .from('accounts')
    .update({ trial_ends_at: new Date(Date.now() - 24 * HOUR).toISOString() })
    .eq('id', teamId)
    .throwOnError();

  return async () => {
    await owner.admin
      .from('accounts')
      .update({ trial_ends_at: new Date(Date.now() + 24 * HOUR).toISOString() })
      .eq('id', teamId)
      .throwOnError();
  };
}

async function signedInMember() {
  const link = await owner.admin.auth.admin.generateLink({
    type: 'magiclink',
    email: (await owner.admin.auth.admin.getUserById(memberId)).data.user!
      .email!,
  });
  const { createClient } = await import('@supabase/supabase-js');
  const memberClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  await memberClient.auth.verifyOtp({
    type: 'magiclink',
    token_hash: link.data.properties!.hashed_token,
  });
  return memberClient;
}

async function setRunStatus(
  runId: string,
  status: 'waiting' | 'awaiting_approval' | 'paused_locked' | 'failed',
): Promise<void> {
  await owner.admin
    .from('workflow_run')
    .update({
      status,
      finished_at: status === 'failed' ? new Date().toISOString() : null,
    })
    .eq('id', runId)
    .throwOnError();
}

async function recordStep(
  runId: string,
  nodeId: string,
  row: { status: 'running' | 'succeeded' | 'failed'; attempt?: number; output?: object; error?: string },
): Promise<void> {
  await owner.admin
    .from('workflow_step_run')
    .insert({
      account_id: teamId,
      run_id: runId,
      node_id: nodeId,
      idempotency_key: `${runId}:${nodeId}:0`,
      finished_at: row.status === 'running' ? null : new Date().toISOString(),
      ...row,
    })
    .throwOnError();
}

async function stepStatuses(runId: string) {
  return (await stepRows(runId)).map(({ node_id, status }) => [node_id, status]);
}

async function failureNotices(runId: string) {
  const { data } = await owner.admin
    .from('notifications')
    .select('recipient_user_id, body, link, dedupe_key')
    .eq('account_id', teamId)
    .like('dedupe_key', `workflow_run_failed:${runId}:%`)
    .order('recipient_user_id')
    .throwOnError();
  return data;
}

async function runCount(): Promise<number | null> {
  const { count } = await owner.admin
    .from('workflow_run')
    .select('id', { count: 'exact', head: true })
    .eq('workflow_id', workflowId)
    .throwOnError();
  return count;
}

beforeEach(async () => {
  temporal.start.mockClear();
  temporal.signal.mockReset();
  temporal.open.clear();
  temporal.startedAt.clear();
  novu.trigger.mockReset();
  temporal.cancel.mockReset();
  temporal.start.mockReset();
  managers.beforeLookup = async () => {};
  novu.trigger.mockClear();
  temporal.onWait = async () => {};
  temporal.slept = [];
  temporal.onSleep = async () => {};
  temporal.fault = async () => {};
  temporal.timeouts = [];
  temporal.conditionTimeouts = [];
  activityContext.heartbeat.mockClear();
  activityContext.seenSignals = [];
  owner = await provisionAccount();
  teamSlug = `wfb-${crypto.randomUUID().slice(0, 8)}`;

  const { data: team } = await owner.admin
    .rpc('create_team_account', {
      account_name: 'Workflow Partners',
      user_id: owner.userId,
      account_slug: teamSlug,
    })
    .throwOnError();
  teamId = team.id;
  managerId = await createUser('manager');
  memberId = await createUser('member');
  await owner.admin
    .from('accounts_memberships')
    .insert([
      { account_id: teamId, user_id: managerId, account_role: 'admin' },
      { account_id: teamId, user_id: memberId, account_role: 'member' },
    ])
    .throwOnError();

  const { data: workflow } = await owner.admin
    .from('workflow')
    .insert({ account_id: teamId, name: 'Pipeline review reminder' })
    .select('id')
    .single()
    .throwOnError();
  workflowId = workflow.id;
});

afterEach(async () => {
  vi.useRealTimers();
  delete process.env.NOVU_API_KEY;
  delete process.env.NOVU_API_URL;
  await owner.admin.from('workflow_run').delete().eq('account_id', teamId);
  await owner.admin.from('accounts').delete().eq('id', teamId);
  await owner.admin.auth.admin.deleteUser(managerId);
  await owner.admin.auth.admin.deleteUser(memberId);
  await owner.cleanup();
});

describe('a published workflow run manually (integration)', () => {
  it('runs the steps after the manual trigger, logs them, and notifies each deal manager once even when a step runs again', async () => {
    await publish(oneStepGraph);
    const { runId } = await runManually();
    const { data: run } = await owner.admin
      .from('workflow_run')
      .select('trigger_node_id')
      .eq('id', runId)
      .single()
      .throwOnError();
    expect(run.trigger_node_id).toBe('start');

    await runPublishedWorkflow({ runId });

    expect(await runRow(runId)).toEqual({
      status: 'succeeded',
      finished_at: expect.any(String),
    });
    expect(await stepRows(runId)).toEqual([
      {
        node_id: 'notify',
        status: 'succeeded',
        attempt: 1,
        error: null,
        idempotency_key: `${runId}:notify:0`,
        workflow_step_log: [
          { level: 'info', message: 'Step started' },
          { level: 'info', message: 'Step succeeded' },
        ],
      },
    ]);
    const notified = { [owner.userId]: 1, [managerId]: 1 };
    expect(await notificationCounts()).toEqual(notified);

    await executeWorkflowStep({
      runId,
      accountId: teamId,
      node: { id: 'notify', type: 'notify_team', config: { message } },
      iterationPath: [],
      input: {},
      steps: { start: {} },
    });

    expect(await notificationCounts()).toEqual(notified);
    expect(await stepRows(runId)).toHaveLength(1);
  });

  it('feeds earlier step outputs into later steps through expressions while a parallel branch runs', async () => {
    await publish({
      nodes: [
        trigger,
        { id: 'first', type: 'notify_team', config: { message } },
        {
          id: 'second',
          type: 'notify_team',
          config: { message: '{{steps.first.notified}} managers were reminded' },
        },
        { id: 'side', type: 'notify_team', config: { message: 'Side branch' } },
      ],
      edges: [edge('start', 'first'), edge('first', 'second'), edge('start', 'side')],
    });
    const { runId } = await runManually();

    await runPublishedWorkflow({ runId });

    expect((await runRow(runId)).status).toBe('succeeded');
    expect(await notificationCounts('2 managers were reminded')).toEqual({
      [owner.userId]: 1,
      [managerId]: 1,
    });
    expect(await notificationCounts('Side branch')).toEqual({
      [owner.userId]: 1,
      [managerId]: 1,
    });
  });

  it('fails the step and the run when a step fails, without stopping a parallel branch', async () => {
    await publish({
      nodes: [
        trigger,
        { id: 'broken', type: 'notify_team', config: { message: RUNTIME_FAILURE } },
        { id: 'after', type: 'notify_team', config: { message: 'After broken' } },
        { id: 'side', type: 'notify_team', config: { message: 'Side branch' } },
      ],
      edges: [edge('start', 'broken'), edge('broken', 'after'), edge('start', 'side')],
    });
    const { runId } = await runManually();

    await runPublishedWorkflow({ runId });

    expect(await runRow(runId)).toEqual({
      status: 'failed',
      finished_at: expect.any(String),
    });
    const [broken, side] = await stepRows(runId);
    expect(broken).toMatchObject({
      node_id: 'broken',
      status: 'failed',
      error: expect.stringContaining('steps.start.missing'),
      workflow_step_log: [
        { level: 'info', message: 'Step started' },
        { level: 'error', message: 'Step failed' },
      ],
    });
    expect(side).toMatchObject({ node_id: 'side', status: 'succeeded' });
    expect(await notificationCounts('After broken')).toEqual({});
  });

  it('fails an unresolved expression without retries', async () => {
    await publish(oneStepGraph);
    const { runId } = await runManually();

    const failure = await executeWorkflowStep({
      runId,
      accountId: teamId,
      node: {
        id: 'notify',
        type: 'notify_team',
        config: { message: '{{steps.missing.field}}' },
      },
      iterationPath: [],
      input: {},
      steps: { start: {} },
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApplicationFailure);
    expect(failure).toMatchObject({
      nonRetryable: true,
      message: expect.stringContaining('steps.missing.field'),
    });
  });

  it('pauses a locked team run before its steps and finishes it once the team is unlocked', async () => {
    await publish({
      nodes: [
        trigger,
        { id: 'notify', type: 'notify_team', config: { message } },
        { id: 'side', type: 'notify_team', config: { message: 'Side branch' } },
      ],
      edges: [edge('start', 'notify'), edge('start', 'side')],
    });
    const unlock = await lockTeam();
    const seenWhileLocked: { status: string; notified: object }[] = [];

    try {
      const { runId } = await runManually();
      temporal.onWait = async () => {
        seenWhileLocked.push({
          status: (await runRow(runId)).status,
          notified: await notificationCounts(),
        });
        await unlock();
      };

      await runPublishedWorkflow({ runId });

      expect(seenWhileLocked).toEqual([{ status: 'paused_locked', notified: {} }]);
      expect((await runRow(runId)).status).toBe('succeeded');
      expect(await notificationCounts()).toEqual({
        [owner.userId]: 1,
        [managerId]: 1,
      });
    } finally {
      await unlock();
    }
  });

  it('never moves a run out of a status the lock did not put it in', async () => {
    await publish(oneStepGraph);
    const { runId } = await runManually();
    await owner.admin
      .from('workflow_run')
      .update({ status: 'awaiting_approval' })
      .eq('id', runId)
      .throwOnError();

    await transitionWorkflowRun({ runId, from: 'running', to: 'paused_locked' });
    await transitionWorkflowRun({ runId, from: 'paused_locked', to: 'running' });

    expect((await runRow(runId)).status).toBe('awaiting_approval');
  });

  it('wakes only the runs paused by the lock when the team is unlocked', async () => {
    await publish(oneStepGraph);
    const paused = await runManually();
    await runManually();
    await owner.admin
      .from('workflow_run')
      .update({ status: 'paused_locked' })
      .eq('id', paused.runId)
      .throwOnError();

    await resumeLockedWorkflowRuns({ accountId: teamId });

    expect(temporal.signal.mock.calls).toEqual([
      [`workflow-run-${paused.runId}`, 'teamUnlocked'],
    ]);
  });

  it('runs a disabled workflow as a test run', async () => {
    await publish(oneStepGraph);
    const { data: workflow } = await owner.admin
      .from('workflow')
      .select('enabled')
      .eq('id', workflowId)
      .single()
      .throwOnError();
    expect(workflow.enabled).toBe(false);

    await runManually();

    expect(await runCount()).toBe(1);
  });

  it('refuses an archived workflow', async () => {
    await publish(oneStepGraph);
    await owner.admin
      .from('workflow')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', workflowId)
      .throwOnError();

    const refusal = startManualWorkflowRun({
      client: owner.user,
      workflowId,
      requestId: crypto.randomUUID(),
    });

    await expect(refusal).rejects.toBeInstanceOf(ManualRunRefused);
    await expect(refusal).rejects.toMatchObject({ reason: 'archived' });
    expect(temporal.start).not.toHaveBeenCalled();
    expect(await runCount()).toBe(0);
  });

  it('asks for a publish when no version is published', async () => {
    await owner.admin
      .from('workflow_version')
      .insert({
        account_id: teamId,
        workflow_id: workflowId,
        schema_version: 1,
        graph: oneStepGraph,
      })
      .throwOnError();

    const refusal = startManualWorkflowRun({
      client: owner.user,
      workflowId,
      requestId: crypto.randomUUID(),
    });

    await expect(refusal).rejects.toBeInstanceOf(ManualRunRefused);
    await expect(refusal).rejects.toThrow('Publish this workflow first');
    expect(temporal.start).not.toHaveBeenCalled();
    expect(await runCount()).toBe(0);
  });

  it('refuses a member without workflows.manage and starts no run', async () => {
    await publish(oneStepGraph);

    const refusal = startManualWorkflowRun({
      client: await signedInMember(),
      workflowId,
      requestId: crypto.randomUUID(),
    });

    await expect(refusal).rejects.toMatchObject({ reason: 'not_permitted' });
    expect(temporal.start).not.toHaveBeenCalled();
    expect(await runCount()).toBe(0);
  });
});

const brokenGraph: WorkflowGraph = {
  nodes: [
    trigger,
    {
      id: 'broken',
      type: 'notify_team',
      label: 'Send reminder',
      config: { message: RUNTIME_FAILURE },
    },
  ],
  edges: [edge('start', 'broken')],
};

describe('a failed workflow run (integration)', () => {
  it('fails a step whose config its schema refuses on the first try', async () => {
    await publish(brokenGraph);
    const { runId } = await runManually();

    const failure = await executeWorkflowStep({
      runId,
      accountId: teamId,
      node: { id: 'broken', type: 'notify_team', config: { message: '' } },
      iterationPath: [],
      input: {},
      steps: { start: {} },
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApplicationFailure);
    expect(failure).toMatchObject({ nonRetryable: true });
  });

  it('tells each deal manager in the app once, linking to the run, and skips the email when Novu is not configured', async () => {
    await publish(brokenGraph);
    const { runId } = await runManually();

    await runPublishedWorkflow({ runId });
    await retryWorkflowRun({ accountId: teamId, runId });
    await runPublishedWorkflow({ runId });

    expect((await runRow(runId)).status).toBe('failed');
    const notice = {
      body: 'Pipeline review reminder failed at Send reminder',
      link: `/home/${teamSlug}/workflows/${workflowId}/runs/${runId}`,
    };
    expect(await failureNotices(runId)).toEqual(
      [owner.userId, managerId].sort().map((userId) => ({
        ...notice,
        recipient_user_id: userId,
        dedupe_key: `workflow_run_failed:${runId}:${userId}`,
      })),
    );
    expect(novu.trigger).not.toHaveBeenCalled();
  });

  it('names the step by its id when it has no label and emails each deal manager through Novu', async () => {
    process.env.NOVU_API_KEY = 'secret';
    process.env.NOVU_API_URL = 'https://novu.test';
    await publish({
      nodes: [trigger, { id: 'broken', type: 'notify_team', config: { message: RUNTIME_FAILURE } }],
      edges: [edge('start', 'broken')],
    });
    const { runId } = await runManually();

    await runPublishedWorkflow({ runId });

    const message = 'Pipeline review reminder failed at broken';
    const path = `/home/${teamSlug}/workflows/${workflowId}/runs/${runId}`;
    expect((await failureNotices(runId)).map((notice) => notice.body)).toEqual([
      message,
      message,
    ]);
    const emailOf = async (userId: string) =>
      (await owner.admin.auth.admin.getUserById(userId)).data.user!.email!;
    const recipients = [
      { userId: owner.userId, email: await emailOf(owner.userId) },
      { userId: managerId, email: await emailOf(managerId) },
    ];
    expect(
      novu.trigger.mock.calls.sort(([, a], [, b]) =>
        JSON.stringify(a).localeCompare(JSON.stringify(b)),
      ),
    ).toEqual(
      recipients
        .map(({ userId, email }) => [
          'workflow-run.failed',
          {
            to: { subscriberId: userId, email },
            payload: { message, path },
            transactionId: `workflow_run_failed:${runId}:${userId}`,
          },
        ])
        .sort(([, a], [, b]) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    );
  });

  it('retries from the failed step under the same key with the attempt counted on, reusing earlier outputs and leaving finished branches alone', async () => {
    await publish({
      nodes: [
        trigger,
        { id: 'first', type: 'notify_team', config: { message: 'First' } },
        {
          id: 'notify',
          type: 'notify_team',
          config: { message: '{{steps.first.notified}} managers were reminded' },
        },
        { id: 'after', type: 'notify_team', config: { message: 'After notify' } },
        { id: 'side', type: 'notify_team', config: { message: 'Side branch' } },
      ],
      edges: [
        edge('start', 'first'),
        edge('first', 'notify'),
        edge('notify', 'after'),
        edge('start', 'side'),
      ],
    });
    const { runId } = await runManually();
    await recordStep(runId, 'first', { status: 'succeeded', output: { notified: 7 } });
    await recordStep(runId, 'side', { status: 'succeeded', output: { notified: 2 } });
    await recordStep(runId, 'notify', {
      status: 'failed',
      attempt: 5,
      error: 'Notification service timed out',
    });
    await owner.admin
      .from('notifications')
      .insert({
        account_id: teamId,
        recipient_user_id: managerId,
        type: 'info',
        body: '7 managers were reminded',
        dedupe_key: `workflow_step:${runId}:notify:0:${managerId}`,
      })
      .throwOnError();
    await setRunStatus(runId, 'failed');
    temporal.start.mockClear();

    await retryWorkflowRun({ accountId: teamId, runId });

    expect(await runRow(runId)).toEqual({ status: 'running', finished_at: null });
    expect(temporal.start.mock.calls).toEqual([
      [
        'runPublishedWorkflow',
        expect.objectContaining({
          workflowId: `workflow-run-${runId}`,
          args: [{ runId }],
        }),
      ],
    ]);

    await runPublishedWorkflow({ runId });

    expect((await runRow(runId)).status).toBe('succeeded');
    expect(
      (await stepRows(runId)).map(({ node_id, status, attempt, error, idempotency_key }) => ({
        node_id,
        status,
        attempt,
        error,
        idempotency_key,
      })),
    ).toEqual(
      [
        ['after', 1],
        ['first', 1],
        ['notify', 6],
        ['side', 1],
      ].map(([nodeId, attempt]) => ({
        node_id: nodeId,
        status: 'succeeded',
        attempt,
        error: null,
        idempotency_key: `${runId}:${nodeId}:0`,
      })),
    );
    const everyManagerOnce = { [owner.userId]: 1, [managerId]: 1 };
    expect(await notificationCounts('7 managers were reminded')).toEqual(everyManagerOnce);
    expect(await notificationCounts('After notify')).toEqual(everyManagerOnce);
    expect(await notificationCounts('First')).toEqual({});
    expect(await notificationCounts('Side branch')).toEqual({});
  });

  it('retries only a failed run', async () => {
    await publish(oneStepGraph);
    const { runId } = await runManually();
    await runPublishedWorkflow({ runId });
    temporal.start.mockClear();

    const refusal = retryWorkflowRun({ accountId: teamId, runId });

    await expect(refusal).rejects.toBeInstanceOf(RunActionRefused);
    await expect(refusal).rejects.toMatchObject({
      reason: 'run_changed',
      message: 'This run already changed. Refresh to see its status.',
    });
    expect((await runRow(runId)).status).toBe('succeeded');
    expect(temporal.start).not.toHaveBeenCalled();
  });

  it('refuses to retry or cancel a run of another team as changed', async () => {
    await publish(oneStepGraph);
    const { runId } = await runManually();
    await setRunStatus(runId, 'failed');
    const otherTeam = crypto.randomUUID();

    await expect(retryWorkflowRun({ accountId: otherTeam, runId })).rejects.toMatchObject({
      reason: 'run_changed',
    });
    await expect(cancelWorkflowRun({ accountId: otherTeam, runId })).rejects.toMatchObject({
      reason: 'run_changed',
    });
    expect((await runRow(runId)).status).toBe('failed');
  });
});

describe('cancelling workflow runs (integration)', () => {
  it('cancels a run, its running steps, and its durable workflow, keeping finished steps', async () => {
    await publish(oneStepGraph);
    const { runId } = await runManually();
    await recordStep(runId, 'first', { status: 'succeeded', output: {} });
    await recordStep(runId, 'notify', { status: 'running' });

    await cancelWorkflowRun({ accountId: teamId, runId });

    expect(await runRow(runId)).toEqual({
      status: 'cancelled',
      finished_at: expect.any(String),
    });
    expect((await stepRows(runId)).map(({ node_id, status }) => [node_id, status])).toEqual([
      ['first', 'succeeded'],
      ['notify', 'cancelled'],
    ]);
    expect(temporal.cancel.mock.calls).toEqual([[`workflow-run-${runId}`]]);
  });

  it('leaves a finished run as it is', async () => {
    await publish(oneStepGraph);
    const { runId } = await runManually();
    await runPublishedWorkflow({ runId });

    await expect(cancelWorkflowRun({ accountId: teamId, runId })).rejects.toMatchObject({
      reason: 'run_changed',
    });

    expect((await runRow(runId)).status).toBe('succeeded');
    expect(temporal.cancel).not.toHaveBeenCalled();
  });

  it('cancels only the waiting, paused and awaiting approval runs on versions older than the latest published one', async () => {
    await publish(oneStepGraph);
    const running = await runManually();
    const waiting = await runManually();
    const awaitingApproval = await runManually();
    const paused = await runManually();
    const failed = await runManually();
    await setRunStatus(waiting.runId, 'waiting');
    await setRunStatus(awaitingApproval.runId, 'awaiting_approval');
    await setRunStatus(paused.runId, 'paused_locked');
    await setRunStatus(failed.runId, 'failed');
    await publish(oneStepGraph);
    const latest = await runManually();

    const result = await cancelWaitingRuns({ accountId: teamId, workflowId });

    const older = [waiting, awaitingApproval, paused].map((run) => run.runId);
    expect(result).toEqual({ cancelled: 3, unreached: 0 });
    expect((await runRow(running.runId)).status).toBe('running');
    for (const runId of older) {
      expect((await runRow(runId)).status).toBe('cancelled');
    }
    expect((await runRow(failed.runId)).status).toBe('failed');
    expect((await runRow(latest.runId)).status).toBe('running');
    expect(temporal.cancel.mock.calls.map(([id]) => id).sort()).toEqual(
      older.map((runId) => `workflow-run-${runId}`).sort(),
    );
  });
});

const unreachable = async () => {
  throw new Error('connect ECONNREFUSED 127.0.0.1:7233');
};

describe('a run action the runner cannot carry out (integration)', () => {
  it('puts a retried run back to failed, leaving its steps, when the runner cannot be reached', async () => {
    await publish(oneStepGraph);
    const { runId } = await runManually();
    await recordStep(runId, 'notify', { status: 'failed', attempt: 5, error: 'Timed out' });
    await setRunStatus(runId, 'failed');
    const before = { run: await runRow(runId), steps: await stepRows(runId) };
    temporal.start.mockImplementationOnce(unreachable);

    const refusal = retryWorkflowRun({ accountId: teamId, runId });

    await expect(refusal).rejects.toBeInstanceOf(RunActionRefused);
    await expect(refusal).rejects.toMatchObject({
      reason: 'runner_unreachable',
      message: "Couldn't reach the runner, try again",
    });
    expect({ run: await runRow(runId), steps: await stepRows(runId) }).toEqual(before);
  });

  it('leaves a cancelled run in its unfinished status, with its waiting step, when the runner cannot be reached', async () => {
    await publish(oneStepGraph);
    const { runId } = await runManually();
    await recordStep(runId, 'notify', { status: 'running' });
    await owner.admin
      .from('workflow_step_run')
      .update({ status: 'waiting' })
      .eq('run_id', runId)
      .throwOnError();
    await setRunStatus(runId, 'awaiting_approval');
    temporal.cancel.mockImplementationOnce(unreachable);

    const refusal = cancelWorkflowRun({ accountId: teamId, runId });

    await expect(refusal).rejects.toMatchObject({ reason: 'runner_unreachable' });
    expect(await runRow(runId)).toEqual({ status: 'awaiting_approval', finished_at: null });
    expect(await stepStatuses(runId)).toEqual([['notify', 'waiting']]);
  });

  it('cancels the older runs the runner could reach and counts only those', async () => {
    await publish(oneStepGraph);
    const reached = await runManually();
    const unreached = await runManually();
    await setRunStatus(reached.runId, 'paused_locked');
    await setRunStatus(unreached.runId, 'waiting');
    await publish(oneStepGraph);
    temporal.cancel.mockImplementation(async (workflowId: string) => {
      if (workflowId === `workflow-run-${unreached.runId}`) {
        await unreachable();
      }
    });

    const result = await cancelWaitingRuns({ accountId: teamId, workflowId });

    expect(result).toEqual({ cancelled: 1, unreached: 1 });
    expect((await runRow(reached.runId)).status).toBe('cancelled');
    expect(await runRow(unreached.runId)).toEqual({ status: 'waiting', finished_at: null });
  });

  it('refuses to retry a run whose step data was removed after 90 days', async () => {
    await publish({
      nodes: [
        trigger,
        { id: 'first', type: 'notify_team', config: { message: 'First' } },
        { id: 'notify', type: 'notify_team', config: { message } },
      ],
      edges: [edge('start', 'first'), edge('first', 'notify')],
    });
    const { runId } = await runManually();
    await recordStep(runId, 'first', { status: 'succeeded', output: { notified: 2 } });
    await recordStep(runId, 'notify', { status: 'failed', error: 'Timed out' });
    await owner.admin
      .from('workflow_step_run')
      .update({ finished_at: new Date(Date.now() - 91 * 24 * HOUR).toISOString() })
      .eq('run_id', runId)
      .throwOnError();
    await setRunStatus(runId, 'failed');
    await owner.admin.rpc('prune_workflow_step_data').throwOnError();
    temporal.start.mockClear();

    const refusal = retryWorkflowRun({ accountId: teamId, runId });

    await expect(refusal).rejects.toBeInstanceOf(RunActionRefused);
    await expect(refusal).rejects.toMatchObject({
      reason: 'step_data_removed',
      message: 'Step data was removed after 90 days. Run the workflow again instead.',
    });
    expect((await runRow(runId)).status).toBe('failed');
    expect(temporal.start).not.toHaveBeenCalled();
  });

  it('keeps a step that finishes after its run was cancelled as cancelled and runs nothing after it', async () => {
    await publish({
      nodes: [
        trigger,
        { id: 'notify', type: 'notify_team', config: { message } },
        { id: 'after', type: 'notify_team', config: { message: 'After notify' } },
      ],
      edges: [edge('start', 'notify'), edge('notify', 'after')],
    });
    const { runId } = await runManually();
    managers.beforeLookup = async () => {
      managers.beforeLookup = async () => {};
      await cancelWorkflowRun({ accountId: teamId, runId });
    };

    await runPublishedWorkflow({ runId });

    expect((await runRow(runId)).status).toBe('cancelled');
    expect(await stepStatuses(runId)).toEqual([['notify', 'cancelled']]);
    expect(await notificationCounts('After notify')).toEqual({});
    expect(await failureNotices(runId)).toEqual([]);
  });

  it('cancels nothing for a workflow with no published version', async () => {
    expect(await cancelWaitingRuns({ accountId: teamId, workflowId })).toEqual({
      cancelled: 0,
      unreached: 0,
    });
  });

  it('starts no step once its run is cancelled, keeping an existing step row cancelled', async () => {
    await publish({
      nodes: [
        trigger,
        { id: 'notify', type: 'notify_team', config: { message } },
        { id: 'after', type: 'notify_team', config: { message: 'After notify' } },
      ],
      edges: [edge('start', 'notify'), edge('notify', 'after')],
    });
    const { runId } = await runManually();
    await recordStep(runId, 'notify', { status: 'running' });
    await cancelWorkflowRun({ accountId: teamId, runId });
    const before = await stepRows(runId);

    const outputs = await Promise.all(
      ['notify', 'after'].map((nodeId) =>
        executeWorkflowStep({
          runId,
          accountId: teamId,
          node: { id: nodeId, type: 'notify_team', config: { message } },
          iterationPath: [],
          input: {},
          steps: { start: {} },
        }),
      ),
    );

    expect(outputs).toEqual([{ kind: 'run_cancelled' }, { kind: 'run_cancelled' }]);
    expect(await stepRows(runId)).toEqual(before);
    expect(await notificationCounts()).toEqual({});
  });

  it('treats a cancel the runner answers with "not found" as reached and cancels the run', async () => {
    await publish(oneStepGraph);
    const { runId } = await runManually();
    await setRunStatus(runId, 'waiting');
    temporal.cancel.mockImplementationOnce(async (workflowId: string) => {
      throw new WorkflowNotFoundError('workflow execution already completed', workflowId, undefined);
    });

    await cancelWorkflowRun({ accountId: teamId, runId });

    expect((await runRow(runId)).status).toBe('cancelled');
  });

  it('refuses a retry while the runner is still closing the earlier execution', async () => {
    await publish(oneStepGraph);
    const { runId } = await runManually();
    await setRunStatus(runId, 'failed');
    temporal.open.add(`workflow-run-${runId}`);

    await expect(retryWorkflowRun({ accountId: teamId, runId })).rejects.toMatchObject({
      reason: 'runner_unreachable',
    });
    expect((await runRow(runId)).status).toBe('failed');
  });

  it('keeps a retried run running when the runner started it but the start call failed', async () => {
    await publish(oneStepGraph);
    const { runId } = await runManually();
    await setRunStatus(runId, 'failed');
    const lostReply = new Error('deadline exceeded');
    temporal.start.mockImplementationOnce(async (_type, options) => {
      temporal.startedAt.set(options.workflowId, new Date());
      throw lostReply;
    });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    await retryWorkflowRun({ accountId: teamId, runId });

    expect(await runRow(runId)).toEqual({ status: 'running', finished_at: null });
    expect(logged.mock.calls.flat()).toContain(lostReply);
    logged.mockRestore();
  });

  it('removes the new run and refuses Run now when the runner cannot be reached', async () => {
    await publish(oneStepGraph);
    temporal.start.mockImplementationOnce(unreachable);

    const refusal = startManualWorkflowRun({
      client: owner.user,
      workflowId,
      requestId: crypto.randomUUID(),
    });

    await expect(refusal).rejects.toBeInstanceOf(RunActionRefused);
    await expect(refusal).rejects.toMatchObject({ reason: 'runner_unreachable' });
    expect(await runCount()).toBe(0);
  });

  it('wakes every paused run even when one cannot be signalled', async () => {
    await publish(oneStepGraph);
    const runs = [await runManually(), await runManually(), await runManually()];
    for (const { runId } of runs) {
      await owner.admin
        .from('workflow_run')
        .update({ status: 'paused_locked' })
        .eq('id', runId)
        .throwOnError();
    }
    temporal.signal.mockImplementationOnce(unreachable);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    await resumeLockedWorkflowRuns({ accountId: teamId });

    expect(temporal.signal.mock.calls.map(([id]) => id).sort()).toEqual(
      runs.map(({ runId }) => `workflow-run-${runId}`).sort(),
    );
    logged.mockRestore();
  });
});

describe('step attempts that overlap (integration)', () => {
  it('returns the output another attempt recorded when this attempt finishes second', async () => {
    await publish(oneStepGraph);
    const { runId } = await runManually();
    const execution = {
      runId,
      accountId: teamId,
      node: { id: 'notify', type: 'notify_team', config: { message } },
      iterationPath: [],
      input: {},
      steps: { start: {} },
    } as const;
    managers.beforeLookup = async () => {
      managers.beforeLookup = async () => {};
      await executeWorkflowStep(execution);
    };

    expect(await executeWorkflowStep(execution)).toEqual({
      kind: 'succeeded',
      output: { notified: 2 },
    });
  });

  it('counts every overlapping attempt on the one step row', async () => {
    await publish(oneStepGraph);
    const { runId } = await runManually();
    await recordStep(runId, 'notify', { status: 'failed', attempt: 3, error: 'Timed out' });
    const execution = {
      runId,
      accountId: teamId,
      node: { id: 'notify', type: 'notify_team', config: { message } },
      iterationPath: [],
      input: {},
      steps: { start: {} },
    } as const;

    await Promise.all([executeWorkflowStep(execution), executeWorkflowStep(execution)]);

    expect((await stepRows(runId)).map(({ attempt }) => attempt)).toEqual([5]);
  });

  it('records a step failure even when the step never got a row', async () => {
    await publish(oneStepGraph);
    const { runId } = await runManually();

    await failWorkflowStep({
      runId,
      accountId: teamId,
      node: { id: 'notify', type: 'notify_team', config: { message } },
      iterationPath: [],
      error: 'database unavailable',
    });

    expect(await stepRows(runId)).toEqual([
      expect.objectContaining({
        node_id: 'notify',
        status: 'failed',
        error: 'database unavailable',
        workflow_step_log: [{ level: 'error', message: 'Step failed' }],
      }),
    ]);
  });
});

describe('the failure notice (integration)', () => {
  it('emails every deal manager exactly once when Novu fails partway and the activity runs again', async () => {
    process.env.NOVU_API_KEY = 'secret';
    process.env.NOVU_API_URL = 'https://novu.test';
    const delivered = new Map<string, number>();
    let calls = 0;
    novu.trigger.mockImplementation(async (_workflowId, data) => {
      calls += 1;
      if (calls === 2) {
        throw new Error('Novu unavailable');
      }
      const { transactionId, to } = data as {
        transactionId: string;
        to: { subscriberId: string };
      };
      if (!delivered.has(transactionId)) {
        delivered.set(transactionId, 0);
        delivered.set(to.subscriberId, (delivered.get(to.subscriberId) ?? 0) + 1);
      }
    });
    await publish(brokenGraph);
    const { runId } = await runManually();
    await recordStep(runId, 'broken', { status: 'failed', error: 'Timed out' });
    await setRunStatus(runId, 'failed');

    await expect(notifyRunFailed({ runId })).rejects.toThrow('Novu unavailable');
    await notifyRunFailed({ runId });

    expect(delivered.get(owner.userId)).toBe(1);
    expect(delivered.get(managerId)).toBe(1);
  });

  it('notifies nobody when the run was cancelled before it could be failed', async () => {
    await publish(brokenGraph);
    const { runId } = await runManually();
    await recordStep(runId, 'broken', { status: 'failed', error: 'Timed out' });
    await cancelWorkflowRun({ accountId: teamId, runId });

    await transitionWorkflowRun({ runId, from: 'running', to: 'failed' });

    expect((await runRow(runId)).status).toBe('cancelled');
    expect(await failureNotices(runId)).toEqual([]);
  });
});

describe('Run now and archiving (integration)', () => {
  it('makes one run for one request id however often it arrives', async () => {
    await publish(oneStepGraph);
    const request = { client: owner.user, workflowId, requestId: crypto.randomUUID() };

    const first = await startManualWorkflowRun(request);
    const second = await startManualWorkflowRun(request);

    expect(second).toEqual(first);
    expect(await runCount()).toBe(1);
  });

  it('lets a run in flight finish after its workflow is archived', async () => {
    await publish(oneStepGraph);
    const { runId } = await runManually();
    await owner.admin
      .from('workflow')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', workflowId)
      .throwOnError();

    await runPublishedWorkflow({ runId });

    expect((await runRow(runId)).status).toBe('succeeded');
    expect(await notificationCounts()).toEqual({ [owner.userId]: 1, [managerId]: 1 });
  });
});

async function runToEnd(): Promise<string> {
  const { runId } = await runManually();
  await runPublishedWorkflow({ runId });
  return runId;
}

async function stepRow(runId: string, nodeId: string, iteration = 0) {
  const { data } = await owner.admin
    .from('workflow_step_run')
    .select('status, output, error, started_at, finished_at')
    .eq('idempotency_key', `${runId}:${nodeId}:${iteration}`)
    .maybeSingle()
    .throwOnError();
  return data;
}

async function runStatus(runId: string): Promise<string> {
  return (await runRow(runId)).status;
}

const notify = (id: string, text: string) =>
  ({ id, type: 'notify_team', config: { message: text } }) as const;
const exit = (sourceNodeId: string, sourceHandle: string, targetNodeId: string) => ({
  ...edge(sourceNodeId, targetNodeId),
  id: `${sourceNodeId}-${sourceHandle}-${targetNodeId}`,
  sourceHandle,
});
const decide = (rule: NodeConfigValue): WorkflowNode => ({ id: 'decide', type: 'branch', config: { rule } });
const firstNotifiedIs = (count: number) => ({ '==': [{ var: 'steps.first.notified' }, count] });

describe('a branch (integration)', () => {
  it('follows only the edges from the handle its rule chose', async () => {
    await publish({
      nodes: [
        trigger,
        notify('first', 'First'),
        decide(firstNotifiedIs(2)),
        notify('onTrue', 'Took true'),
        notify('onFalse', 'Took false'),
      ],
      edges: [
        edge('start', 'first'),
        edge('first', 'decide'),
        exit('decide', 'true', 'onTrue'),
        exit('decide', 'false', 'onFalse'),
      ],
    });

    const runId = await runToEnd();

    expect(await runStatus(runId)).toBe('succeeded');
    expect(await stepRow(runId, 'decide')).toMatchObject({ status: 'succeeded' });
    expect(await notificationCounts('Took true')).toEqual({ [owner.userId]: 1, [managerId]: 1 });
    expect(await stepRow(runId, 'onFalse')).toBeNull();
  });

  it('fails at once when its rule reads a value that is missing', async () => {
    const graph = {
      nodes: [
        trigger,
        notify('first', 'First'),
        decide({ '==': [{ var: 'steps.first.missing' }, 2] }),
        notify('onTrue', 'Took true'),
        notify('onFalse', 'Took false'),
      ],
      edges: [
        edge('start', 'first'),
        edge('first', 'decide'),
        exit('decide', 'true', 'onTrue'),
        exit('decide', 'false', 'onFalse'),
      ],
    };
    await publish(graph);

    const runId = await runToEnd();

    expect(await runStatus(runId)).toBe('failed');
    expect(await stepRow(runId, 'decide')).toMatchObject({
      status: 'failed',
      error: 'steps.first.missing does not name a value',
    });
    expect(await stepRow(runId, 'onTrue')).toBeNull();
    expect(await stepRow(runId, 'onFalse')).toBeNull();

    const failure = await executeWorkflowStep({
      runId: (await runManually()).runId,
      accountId: teamId,
      node: graph.nodes[2]!,
      iterationPath: [],
      input: {},
      steps: { start: {}, first: { notified: 2 } },
    }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApplicationFailure);
    expect(failure).toMatchObject({
      nonRetryable: true,
      message: 'steps.first.missing does not name a value',
    });
  });
});

describe('a merge (integration)', () => {
  it('does not wait for the path a branch did not take and keys its output by step id', async () => {
    await publish({
      nodes: [
        trigger,
        notify('first', 'First'),
        decide(firstNotifiedIs(2)),
        notify('onTrue', 'Took true'),
        notify('onFalse', 'Took false'),
        { id: 'join', type: 'merge', config: {} },
        notify('after', 'After join'),
      ],
      edges: [
        edge('start', 'first'),
        edge('first', 'decide'),
        exit('decide', 'true', 'onTrue'),
        exit('decide', 'false', 'onFalse'),
        edge('onTrue', 'join'),
        edge('onFalse', 'join'),
        edge('join', 'after'),
      ],
    });

    const runId = await runToEnd();

    expect(await runStatus(runId)).toBe('succeeded');
    expect(await stepRow(runId, 'join')).toMatchObject({
      status: 'succeeded',
      output: { onTrue: { notified: 2 } },
    });
    expect(await notificationCounts('After join')).toEqual({ [owner.userId]: 1, [managerId]: 1 });
  });

  it('waits for every incoming path that runs', async () => {
    await publish({
      nodes: [
        trigger,
        notify('left', 'Left'),
        notify('right', 'Right'),
        { id: 'join', type: 'merge', config: {} },
      ],
      edges: [
        edge('start', 'left'),
        edge('start', 'right'),
        edge('left', 'join'),
        edge('right', 'join'),
      ],
    });

    const runId = await runToEnd();

    expect(await stepRow(runId, 'join')).toMatchObject({
      status: 'succeeded',
      output: { left: { notified: 2 }, right: { notified: 2 } },
    });
  });

  it('does not run when an incoming path failed', async () => {
    await publish({
      nodes: [
        trigger,
        notify('left', RUNTIME_FAILURE),
        notify('right', 'Right'),
        { id: 'join', type: 'merge', config: {} },
        notify('after', 'After join'),
      ],
      edges: [
        edge('start', 'left'),
        edge('start', 'right'),
        edge('left', 'join'),
        edge('right', 'join'),
        edge('join', 'after'),
      ],
    });

    const runId = await runToEnd();

    expect(await runStatus(runId)).toBe('failed');
    expect(await stepRow(runId, 'right')).toMatchObject({ status: 'succeeded' });
    expect(await stepRow(runId, 'join')).toBeNull();
    expect(await stepRow(runId, 'after')).toBeNull();
  });
});

type LoopOutput = { items: unknown[]; processed: number; total: number };

async function loopBudget(runId: string) {
  const { data } = await owner.admin
    .from('workflow_run')
    .select('loop_items_processed, loop_items_total')
    .eq('id', runId)
    .single()
    .throwOnError();
  return data;
}

async function savedWork() {
  const { data } = await owner.admin
    .from('workflow_loop_saved_work')
    .select('node_id, items, saved_by_run_id, claimed_by_run_id')
    .eq('workflow_id', workflowId)
    .order('created_at')
    .throwOnError();
  return data;
}

const loopGraph = (config: WorkflowNode['config']): WorkflowGraph => ({
  nodes: [
    trigger,
    { id: 'items', type: 'loop', config },
    notify('each', 'Item {{steps.items.item}}'),
    notify('done', 'All items done'),
  ],
  edges: [edge('start', 'items'), exit('items', 'each', 'each'), exit('items', 'done', 'done')],
});

describe('a loop (integration)', () => {
  it('runs its each path once per item in order under the item index, then its done path', async () => {
    await publish(loopGraph({ items: ['a', 'b', 'c'] }));

    const runId = await runToEnd();

    expect(await runStatus(runId)).toBe('succeeded');
    const each = await Promise.all([0, 1, 2].map((index) => stepRow(runId, 'each', index)));
    for (const [index, text] of ['a', 'b', 'c'].entries()) {
      expect(each[index]).toMatchObject({ status: 'succeeded' });
      expect(await notificationCounts(`Item ${text}`)).toEqual({
        [owner.userId]: 1,
        [managerId]: 1,
      });
    }
    expect(each[0]!.finished_at! <= each[1]!.started_at).toBe(true);
    expect(each[1]!.finished_at! <= each[2]!.started_at).toBe(true);
    const done = await stepRow(runId, 'done');
    expect(done!.started_at >= each[2]!.finished_at!).toBe(true);
  });

  it('runs its items in parallel when asked, then its done path once', async () => {
    await publish(loopGraph({ items: ['a', 'b', 'c'], parallel: true }));

    const runId = await runToEnd();

    expect(await runStatus(runId)).toBe('succeeded');
    for (const index of [0, 1, 2]) {
      expect(await stepRow(runId, 'each', index)).toMatchObject({ status: 'succeeded' });
    }
    expect(await notificationCounts('All items done')).toEqual({
      [owner.userId]: 1,
      [managerId]: 1,
    });
  });

  it('does 500 items, saves the rest for the next run, and hands saved items out once', async () => {
    const items = Array.from({ length: 502 }, (_, index) => index);
    await publish({
      nodes: [trigger, { id: 'items', type: 'loop', config: { items } }],
      edges: [edge('start', 'items')],
    });

    const first = await runToEnd();
    expect(await stepRow(first, 'items')).toMatchObject({
      status: 'succeeded',
      output: { processed: 500, total: 502, items: items.slice(0, 500) },
    });
    expect(await loopBudget(first)).toEqual({ loop_items_processed: 500, loop_items_total: 502 });
    expect(await savedWork()).toEqual([
      { node_id: 'items', items: [500, 501], saved_by_run_id: first, claimed_by_run_id: null },
    ]);

    const together = [(await runManually()).runId, (await runManually()).runId];
    await Promise.all(together.map((runId) => runPublishedWorkflow({ runId })));

    const outputs = await Promise.all(
      together.map(async (runId) => (await stepRow(runId, 'items'))!.output as LoopOutput),
    );
    expect(outputs.map((output) => output.total).sort()).toEqual([502, 504]);
    const claimer = together[outputs.findIndex((output) => output.total === 504)];
    expect(outputs.find((output) => output.total === 504)!.items.slice(0, 3)).toEqual([500, 501, 0]);
    expect((await savedWork()).filter((row) => row.saved_by_run_id === first)).toEqual([
      { node_id: 'items', items: [500, 501], saved_by_run_id: first, claimed_by_run_id: claimer },
    ]);
  });
});

describe('a wait (integration)', () => {
  const waitGraph = (config: WorkflowNode['config']): WorkflowGraph => ({
    nodes: [trigger, { id: 'pause', type: 'wait', config }, notify('after', 'After the wait')],
    edges: [edge('start', 'pause'), edge('pause', 'after')],
  });

  it('parks its path on a durable timer for the duration, shows the run waiting, then carries on', async () => {
    await publish(waitGraph({ kind: 'duration', amount: 5, unit: 'minutes' }));
    const { runId } = await runManually();
    const seen: unknown[] = [];
    temporal.onSleep = async () => {
      seen.push(await runStatus(runId), (await stepRow(runId, 'pause'))!.status);
    };

    await runPublishedWorkflow({ runId });

    expect(seen).toEqual(['waiting', 'waiting']);
    expect(temporal.slept).toHaveLength(1);
    expect(temporal.slept[0]).toBeGreaterThan(4 * 60 * 1000);
    expect(temporal.slept[0]).toBeLessThanOrEqual(5 * 60 * 1000);
    expect(await runStatus(runId)).toBe('succeeded');
    expect(await stepRow(runId, 'pause')).toMatchObject({ status: 'succeeded' });
    expect(await notificationCounts('After the wait')).toEqual({
      [owner.userId]: 1,
      [managerId]: 1,
    });
  });

  it('waits until a full date and time as given', async () => {
    const until = new Date(Date.now() + 2 * HOUR).toISOString();
    await publish(waitGraph({ kind: 'until', until }));

    await runToEnd();

    expect(temporal.slept).toHaveLength(1);
    expect(Math.abs(temporal.slept[0]! - 2 * HOUR)).toBeLessThan(60 * 1000);
  });

  it('can be cancelled while waiting, and nothing after it runs', async () => {
    await publish(waitGraph({ kind: 'duration', amount: 1, unit: 'hours' }));
    const { runId } = await runManually();
    temporal.onSleep = async () => {
      await cancelWorkflowRun({ accountId: teamId, runId });
    };

    await runPublishedWorkflow({ runId });

    expect(await runStatus(runId)).toBe('cancelled');
    expect(await stepRow(runId, 'pause')).toMatchObject({ status: 'cancelled' });
    expect(await stepRow(runId, 'after')).toBeNull();
  });

  it('keeps the run running while another path works and shows waiting once every unfinished path waits', async () => {
    await publish({
      nodes: [
        trigger,
        { id: 'pause', type: 'wait', config: { kind: 'duration', amount: 5, unit: 'minutes' } },
        notify('busy', 'Busy path'),
      ],
      edges: [edge('start', 'pause'), edge('start', 'busy')],
    });
    const { runId } = await runManually();
    let pathParked!: () => void;
    const parked = new Promise<void>((resolve) => (pathParked = resolve));
    const whileBusy: string[] = [];
    managers.beforeLookup = async () => {
      managers.beforeLookup = async () => {};
      await parked;
      whileBusy.push(await runStatus(runId));
    };
    temporal.onSleep = async () => {
      pathParked();
      await expect.poll(() => runStatus(runId), { timeout: 15_000 }).toBe('waiting');
    };

    await runPublishedWorkflow({ runId });

    expect(whileBusy).toEqual(['running']);
    expect(await runStatus(runId)).toBe('succeeded');
  });
});

describe('a run that cannot be loaded (integration)', () => {
  it('fails the run with the first graph problem and tells the deal managers', async () => {
    await publish({
      nodes: [trigger, notify('notify', '')],
      edges: [edge('start', 'notify')],
    });

    const runId = await runToEnd();

    const { data: run } = await owner.admin
      .from('workflow_run')
      .select('status, error, finished_at')
      .eq('id', runId)
      .single()
      .throwOnError();
    expect(run).toEqual({
      status: 'failed',
      error: 'The message setting is not valid',
      finished_at: expect.any(String),
    });
    expect((await failureNotices(runId)).map((notice) => notice.body)).toEqual([
      'Pipeline review reminder failed: The message setting is not valid',
      'Pipeline review reminder failed: The message setting is not valid',
    ]);
  });

  it('fails a run whose version has a schema version the runner does not know', async () => {
    const { data: version } = await owner.admin
      .from('workflow_version')
      .insert({
        account_id: teamId,
        workflow_id: workflowId,
        schema_version: 99,
        graph: oneStepGraph,
        published_at: new Date().toISOString(),
        published_by: owner.userId,
      })
      .select('id')
      .single()
      .throwOnError();
    const { data: inserted } = await owner.admin
      .from('workflow_run')
      .insert({
        account_id: teamId,
        workflow_id: workflowId,
        version_id: version.id,
        trigger_kind: 'manual',
        trigger_ref: crypto.randomUUID(),
        trigger_node_id: 'start',
      })
      .select('id')
      .single()
      .throwOnError();

    await runPublishedWorkflow({ runId: inserted.id });

    const { data: run } = await owner.admin
      .from('workflow_run')
      .select('status, error')
      .eq('id', inserted.id)
      .single()
      .throwOnError();
    expect(run).toEqual({ status: 'failed', error: 'Schema version 99 is not supported' });
  });
});

async function stepRowAt(runId: string, nodeId: string, iteration: string) {
  const { data } = await owner.admin
    .from('workflow_step_run')
    .select('status')
    .eq('idempotency_key', `${runId}:${nodeId}:${iteration}`)
    .maybeSingle()
    .throwOnError();
  return data;
}

describe('a loop inside a loop (integration)', () => {
  it('runs the inner each path per outer item under the full iteration path, reading both items', async () => {
    await publish({
      nodes: [
        trigger,
        {
          id: 'outer',
          type: 'loop',
          config: {
            items: [
              { name: 'A', subs: ['x', 'y'] },
              { name: 'B', subs: ['z'] },
            ],
          },
        },
        { id: 'inner', type: 'loop', config: { items: '{{steps.outer.item.subs}}' } },
        notify('sub', 'Sub {{steps.outer.item.name}} {{steps.inner.item}}'),
      ],
      edges: [edge('start', 'outer'), exit('outer', 'each', 'inner'), exit('inner', 'each', 'sub')],
    });

    const runId = await runToEnd();

    expect(await runStatus(runId)).toBe('succeeded');
    for (const iteration of ['0', '1']) {
      expect(await stepRowAt(runId, 'inner', iteration)).toEqual({ status: 'succeeded' });
    }
    for (const iteration of ['0.0', '0.1', '1.0']) {
      expect(await stepRowAt(runId, 'sub', iteration)).toEqual({ status: 'succeeded' });
    }
    for (const text of ['Sub A x', 'Sub A y', 'Sub B z']) {
      expect(await notificationCounts(text)).toEqual({ [owner.userId]: 1, [managerId]: 1 });
    }
  });
});

describe('a wait until a plain date (integration)', () => {
  it("wakes at 09:00 in the team's time zone", async () => {
    await owner.admin
      .from('accounts')
      .update({ timezone: 'America/New_York' })
      .eq('id', teamId)
      .throwOnError();
    await publish({
      nodes: [
        trigger,
        { id: 'pause', type: 'wait', config: { kind: 'until', until: '2027-01-15' } },
        notify('after', 'After the date'),
      ],
      edges: [edge('start', 'pause'), edge('pause', 'after')],
    });
    const { runId } = await runManually();
    const expected = Date.parse('2027-01-15T14:00:00Z') - Date.now();

    await runPublishedWorkflow({ runId });

    expect(temporal.slept).toHaveLength(1);
    expect(Math.abs(temporal.slept[0]! - expected)).toBeLessThan(60 * 1000);
    expect(await runStatus(runId)).toBe('succeeded');
    expect(await notificationCounts('After the date')).toEqual({
      [owner.userId]: 1,
      [managerId]: 1,
    });
  });
});

describe('what the run page reads from a step (integration)', () => {
  it('records when a waiting step wakes', async () => {
    await publish({
      nodes: [
        trigger,
        { id: 'pause', type: 'wait', config: { kind: 'duration', amount: 5, unit: 'minutes' } },
      ],
      edges: [edge('start', 'pause')],
    });
    const { runId } = await runManually();
    const seen: { started_at: string; wake_at: string | null }[] = [];
    temporal.onSleep = async () => {
      const { data } = await owner.admin
        .from('workflow_step_run')
        .select('started_at, wake_at')
        .eq('idempotency_key', `${runId}:pause:0`)
        .single()
        .throwOnError();
      seen.push(data);
    };

    await runPublishedWorkflow({ runId });

    expect(seen).toHaveLength(1);
    const waited = Date.parse(seen[0]!.wake_at!) - Date.parse(seen[0]!.started_at);
    expect(waited).toBeGreaterThanOrEqual(5 * 60 * 1000);
    expect(waited).toBeLessThan(5 * 60 * 1000 + 5_000);
  });

  it("records each step's place in its loops, empty outside them", async () => {
    await publish({
      nodes: [
        trigger,
        { id: 'outer', type: 'loop', config: { items: [['x', 'y'], ['z']] } },
        { id: 'inner', type: 'loop', config: { items: '{{steps.outer.item}}' } },
        notify('sub', 'Sub {{steps.inner.item}}'),
      ],
      edges: [edge('start', 'outer'), exit('outer', 'each', 'inner'), exit('inner', 'each', 'sub')],
    });

    const runId = await runToEnd();

    const { data } = await owner.admin
      .from('workflow_step_run')
      .select('node_id, iteration_path')
      .eq('run_id', runId)
      .order('idempotency_key')
      .throwOnError();
    expect(data).toEqual([
      { node_id: 'inner', iteration_path: [0] },
      { node_id: 'inner', iteration_path: [1] },
      { node_id: 'outer', iteration_path: [] },
      { node_id: 'sub', iteration_path: [0, 0] },
      { node_id: 'sub', iteration_path: [0, 1] },
      { node_id: 'sub', iteration_path: [1, 0] },
    ]);
  });

  it('refuses to retry a run that failed before any step', async () => {
    await publish({ nodes: [trigger, notify('notify', '')], edges: [edge('start', 'notify')] });
    const runId = await runToEnd();
    temporal.start.mockClear();

    const refusal = retryWorkflowRun({ accountId: teamId, runId });

    await expect(refusal).rejects.toBeInstanceOf(RunActionRefused);
    await expect(refusal).rejects.toMatchObject({
      reason: 'run_never_started',
      message: 'This run never started. Fix the workflow, then run it again.',
    });
    expect(await runStatus(runId)).toBe('failed');
    expect(temporal.start).not.toHaveBeenCalled();
  });
});

describe('the 500 loop items a run may process (integration)', () => {
  const nestedGraph: WorkflowGraph = {
    nodes: [
      trigger,
      {
        id: 'burn',
        type: 'loop',
        config: { items: Array.from({ length: 497 }, (_, index) => index) },
      },
      {
        id: 'outer',
        type: 'loop',
        config: {
          items: [
            { name: 'A', subs: ['a1', 'a2'] },
            { name: 'B', subs: ['b1'] },
          ],
        },
      },
      { id: 'inner', type: 'loop', config: { items: '{{steps.outer.item.subs}}' } },
      notify('sub', 'Sub {{steps.outer.item.name}} {{steps.inner.item}}'),
    ],
    edges: [
      edge('start', 'burn'),
      exit('burn', 'done', 'outer'),
      exit('outer', 'each', 'inner'),
      exit('inner', 'each', 'sub'),
    ],
  };
  const everyManagerOnce = () => ({ [owner.userId]: 1, [managerId]: 1 });

  it('counts items at every loop level against one budget and saves the inner items it could not reach', async () => {
    await publish(nestedGraph);

    const runId = await runToEnd();

    expect(await runStatus(runId)).toBe('succeeded');
    expect(await loopBudget(runId)).toEqual({ loop_items_processed: 500, loop_items_total: 502 });
    expect(await notificationCounts('Sub A a1')).toEqual(everyManagerOnce());
    expect(await notificationCounts('Sub A a2')).toEqual({});
    expect(await notificationCounts('Sub B b1')).toEqual({});
    expect(await savedWork()).toEqual([
      { node_id: 'inner', items: ['a2'], saved_by_run_id: runId, claimed_by_run_id: null },
      { node_id: 'inner', items: ['b1'], saved_by_run_id: runId, claimed_by_run_id: null },
    ]);
  });

  it('resumes the saved inner items first in the next run, inside their outer item', async () => {
    await publish(nestedGraph);
    const first = await runToEnd();

    const second = await runToEnd();

    expect(await notificationCounts('Sub A a2')).toEqual(everyManagerOnce());
    expect(await notificationCounts('Sub B b1')).toEqual(everyManagerOnce());
    expect(await notificationCounts('Sub A a1')).toEqual(everyManagerOnce());
    expect(await loopBudget(second)).toEqual({ loop_items_processed: 500, loop_items_total: 503 });
    expect(
      (await savedWork()).filter((row) => row.saved_by_run_id === first).map((row) => row.claimed_by_run_id),
    ).toEqual([second, second]);
    expect((await savedWork()).filter((row) => row.saved_by_run_id === second)).toEqual([
      { node_id: 'outer', items: [{ name: 'B', subs: ['b1'] }], saved_by_run_id: second, claimed_by_run_id: null },
      { node_id: 'inner', items: ['a1', 'a2'], saved_by_run_id: second, claimed_by_run_id: null },
    ]);
  });
});

async function insertRun(graph: unknown, schemaVersion = 2): Promise<string> {
  const { data: version } = await owner.admin
    .from('workflow_version')
    .insert({
      account_id: teamId,
      workflow_id: workflowId,
      schema_version: schemaVersion,
      graph: graph as WorkflowGraph,
      published_at: new Date().toISOString(),
      published_by: owner.userId,
    })
    .select('id')
    .single()
    .throwOnError();
  const { data: run } = await owner.admin
    .from('workflow_run')
    .insert({
      account_id: teamId,
      workflow_id: workflowId,
      version_id: version.id,
      trigger_kind: 'manual',
      trigger_ref: crypto.randomUUID(),
      trigger_node_id: 'start',
    })
    .select('id')
    .single()
    .throwOnError();
  return run.id;
}

async function runRecord(runId: string) {
  const { data } = await owner.admin
    .from('workflow_run')
    .select('status, error')
    .eq('id', runId)
    .single()
    .throwOnError();
  return data;
}

async function saveWork(input: {
  rootNodeId: string;
  nodeId: string;
  items: unknown[];
  steps: Record<string, unknown>;
}): Promise<string> {
  const { runId: savedBy } = await runManually();
  await setRunStatus(savedBy, 'failed');
  await owner.admin
    .from('workflow_loop_saved_work')
    .insert({
      account_id: teamId,
      workflow_id: workflowId,
      root_node_id: input.rootNodeId,
      node_id: input.nodeId,
      items: input.items as never,
      context: { input: {}, steps: input.steps } as never,
      saved_by_run_id: savedBy,
    })
    .throwOnError();
  return savedBy;
}

describe('paths that cannot arrive (integration)', () => {
  it('does not wait at a merge for a path that hangs off a trigger this run did not start from', async () => {
    await publish({
      nodes: [
        trigger,
        { id: 'nightly', type: 'schedule_trigger', config: { every: 'day', at: '09:00' } },
        notify('left', 'Left'),
        notify('right', 'Right'),
        { id: 'join', type: 'merge', config: {} },
        notify('after', 'After join'),
      ],
      edges: [
        edge('start', 'left'),
        edge('nightly', 'right'),
        edge('left', 'join'),
        edge('right', 'join'),
        edge('join', 'after'),
      ],
    });

    const runId = await runToEnd();

    expect(await stepRow(runId, 'join')).toMatchObject({
      status: 'succeeded',
      output: { left: { notified: 2 } },
    });
    expect(await notificationCounts('After join')).toEqual({ [owner.userId]: 1, [managerId]: 1 });
  });
});

describe('bookkeeping that keeps failing (integration)', () => {
  it('still records the run as failed when ending the run keeps failing', async () => {
    await publish(oneStepGraph);
    const { runId } = await runManually();
    temporal.fault = async (activity, input) => {
      if (activity === 'transitionWorkflowRun' && (input as { to: string }).to === 'succeeded') {
        throw new Error('database unavailable');
      }
    };

    await runPublishedWorkflow({ runId });

    expect(await runRecord(runId)).toEqual({ status: 'failed', error: 'database unavailable' });
  });

  it('still records the run as failed when recording a step failure keeps failing', async () => {
    await publish({ nodes: [trigger, notify('broken', RUNTIME_FAILURE)], edges: [edge('start', 'broken')] });
    const { runId } = await runManually();
    temporal.fault = async (activity) => {
      if (activity === 'failWorkflowStep') {
        throw new Error('database unavailable');
      }
    };

    await runPublishedWorkflow({ runId });

    expect(await runRecord(runId)).toEqual({ status: 'failed', error: 'database unavailable' });
  });

  it('still ends failed when the failure notice cannot be sent', async () => {
    await publish({ nodes: [trigger, notify('broken', RUNTIME_FAILURE)], edges: [edge('start', 'broken')] });
    const { runId } = await runManually();
    temporal.fault = async (activity) => {
      if (activity === 'notifyRunFailed') {
        throw new Error('Novu unavailable');
      }
    };

    await runPublishedWorkflow({ runId });

    expect(await runRecord(runId)).toEqual({ status: 'failed', error: null });
  });

  it('fails a run whose graph cannot be read', async () => {
    const runId = await insertRun({ nodes: 'not a list', edges: [] });

    await runPublishedWorkflow({ runId });

    expect(await runRecord(runId)).toEqual({
      status: 'failed',
      error: 'The workflow graph could not be read',
    });
  });
});

describe('recording a step failure (integration)', () => {
  it('leaves a step that already succeeded or was cancelled as it is', async () => {
    await publish(oneStepGraph);
    const { runId } = await runManually();
    await recordStep(runId, 'done', { status: 'succeeded', output: { notified: 2 } });
    await recordStep(runId, 'stopped', { status: 'running' });
    await owner.admin
      .from('workflow_step_run')
      .update({ status: 'cancelled', finished_at: new Date().toISOString() })
      .eq('idempotency_key', `${runId}:stopped:0`)
      .throwOnError();

    for (const nodeId of ['done', 'stopped']) {
      await failWorkflowStep({
        runId,
        accountId: teamId,
        node: { id: nodeId, type: 'notify_team', config: { message } },
        iterationPath: [],
        error: 'late failure',
      });
    }

    expect(await stepRow(runId, 'done')).toMatchObject({
      status: 'succeeded',
      error: null,
      output: { notified: 2 },
    });
    expect(await stepRow(runId, 'stopped')).toMatchObject({ status: 'cancelled', error: null });
  });

  it('never grants a loop twice when its step runs again after the grant committed', async () => {
    await publish(loopGraph({ items: ['a', 'b', 'c'] }));
    const { runId } = await runManually();
    const loopNode: WorkflowNode = { id: 'items', type: 'loop', config: { items: ['a', 'b', 'c'] } };
    const execution = { runId, accountId: teamId, node: loopNode, iterationPath: [], input: {}, steps: { start: {} } };

    const first = await executeWorkflowStep(execution);
    const again = await executeWorkflowStep(execution);

    expect(again).toEqual(first);
    expect(await loopBudget(runId)).toEqual({ loop_items_processed: 3, loop_items_total: 3 });
  });
});

describe('carried-over loop items (integration)', () => {
  const resumeGraph: WorkflowGraph = {
    nodes: [
      trigger,
      { id: 'outer', type: 'loop', config: { items: [{ name: 'A', subs: [{ t: 'a1' }] }] } },
      { id: 'inner', type: 'loop', config: { items: '{{steps.outer.item.subs}}' } },
      notify('sub', 'Sub {{steps.inner.item.t}}'),
      notify('outerDone', 'Outer done'),
    ],
    edges: [
      edge('start', 'outer'),
      exit('outer', 'each', 'inner'),
      exit('inner', 'each', 'sub'),
      exit('outer', 'done', 'outerDone'),
    ],
  };
  const outerContext = { start: {}, outer: { item: { name: 'A', subs: [] }, index: 0 } };

  it('does not run the root done path when a resumed item fails', async () => {
    await publish(resumeGraph);
    await saveWork({ rootNodeId: 'outer', nodeId: 'inner', items: [{ bad: 1 }], steps: outerContext });

    const runId = await runToEnd();

    expect(await runStatus(runId)).toBe('failed');
    expect(await notificationCounts('Sub a1')).toEqual({ [owner.userId]: 1, [managerId]: 1 });
    expect(await notificationCounts('Outer done')).toEqual({});
  });

  it('runs a done path only in the run that finishes the last carried-over items', async () => {
    await publish({
      nodes: [
        trigger,
        { id: 'items', type: 'loop', config: { items: ['f1'] } },
        notify('done', 'All items done'),
      ],
      edges: [edge('start', 'items'), exit('items', 'done', 'done')],
    });
    await saveWork({
      rootNodeId: 'items',
      nodeId: 'items',
      items: Array.from({ length: 500 }, (_, i) => i),
      steps: { start: {} },
    });

    await runToEnd();
    expect(await notificationCounts('All items done')).toEqual({});

    await runToEnd();
    expect(await notificationCounts('All items done')).toEqual({ [owner.userId]: 1, [managerId]: 1 });
  });

  it('puts claimed items back when the run is cancelled before reaching them', async () => {
    await publish(loopGraph({ items: ['f1'] }));
    await saveWork({ rootNodeId: 'items', nodeId: 'items', items: ['s1', 's2'], steps: { start: {} } });
    const { runId } = await runManually();
    managers.beforeLookup = async () => {
      managers.beforeLookup = async () => {};
      await cancelWorkflowRun({ accountId: teamId, runId });
    };

    await runPublishedWorkflow({ runId });

    expect(await runStatus(runId)).toBe('cancelled');
    expect((await savedWork()).filter((row) => row.saved_by_run_id === runId)).toEqual([
      { node_id: 'items', items: ['s2'], saved_by_run_id: runId, claimed_by_run_id: null },
    ]);
  });

  it('puts claimed items back when the run fails before reaching them, and its retry leaves them for the next run', async () => {
    await publish(loopGraph({ items: ['f1'] }));
    await saveWork({ rootNodeId: 'items', nodeId: 'items', items: ['s1', 's2'], steps: { start: {} } });
    const { runId } = await runManually();
    let stepFaulted = false;
    let bookkeepingFaulted = false;
    temporal.fault = async (activity, input) => {
      if (
        activity === 'executeWorkflowStep' &&
        (input as { node: { id: string } }).node.id === 'each' &&
        !stepFaulted
      ) {
        stepFaulted = true;
        throw new Error('step failed');
      }
      if (activity === 'failWorkflowStep' && !bookkeepingFaulted) {
        bookkeepingFaulted = true;
        throw new Error('database unavailable');
      }
    };

    await runPublishedWorkflow({ runId });

    expect(await runRecord(runId)).toEqual({ status: 'failed', error: 'database unavailable' });
    expect((await savedWork()).filter((row) => row.saved_by_run_id === runId)).toEqual([
      { node_id: 'items', items: ['s2'], saved_by_run_id: runId, claimed_by_run_id: null },
    ]);

    await retryWorkflowRun({ accountId: teamId, runId });
    await runPublishedWorkflow({ runId });

    expect(await notificationCounts('Item s1')).toEqual({ [owner.userId]: 1, [managerId]: 1 });
    expect(await notificationCounts('Item s2')).toEqual({});
    expect(await notificationCounts('Item f1')).toEqual({ [owner.userId]: 1, [managerId]: 1 });
  });
});

describe('saved loop work over time (integration)', () => {
  const overflowGraph = (): WorkflowGraph => ({
    nodes: [trigger, { id: 'items', type: 'loop', config: { items: Array.from({ length: 502 }, (_, i) => i) } }],
    edges: [edge('start', 'items')],
  });

  it('prunes claimed saved work and saved work older than 90 days', async () => {
    await publish(overflowGraph());
    const first = await runToEnd();
    const second = await runToEnd();

    await owner.admin.rpc('prune_workflow_step_data').throwOnError();
    expect((await savedWork()).map((row) => row.saved_by_run_id)).toEqual([second]);

    await owner.admin
      .from('workflow_loop_saved_work')
      .update({ created_at: new Date(Date.now() - 91 * 24 * HOUR).toISOString() })
      .eq('saved_by_run_id', second)
      .throwOnError();
    await owner.admin.rpc('prune_workflow_step_data').throwOnError();
    expect(await savedWork()).toEqual([]);
    expect(first).not.toBe(second);
  });

  it('drops the saved work when a new version is published, including work an older run saves later', async () => {
    await publish(overflowGraph());
    await runToEnd();
    const { runId: olderRun } = await runManually();

    await publish(overflowGraph());
    expect(await savedWork()).toEqual([]);

    await runPublishedWorkflow({ runId: olderRun });
    const newer = await runToEnd();

    expect(((await stepRow(newer, 'items'))!.output as LoopOutput).total).toBe(502);
  });

  it('drops the saved work when a draft is published by setting its publish time', async () => {
    await publish(overflowGraph());
    await runToEnd();
    const { data: draft } = await owner.admin
      .from('workflow_version')
      .insert({ account_id: teamId, workflow_id: workflowId, schema_version: 1, graph: overflowGraph() })
      .select('id')
      .single()
      .throwOnError();

    await owner.admin
      .from('workflow_version')
      .update({ published_at: new Date().toISOString(), published_by: owner.userId })
      .eq('id', draft.id)
      .throwOnError();

    expect(await savedWork()).toEqual([]);
  });
});

describe('a wait that has started (integration)', () => {
  it('keeps the wake time it was given even when the team time zone changes', async () => {
    await owner.admin.from('accounts').update({ timezone: 'America/New_York' }).eq('id', teamId).throwOnError();
    await publish({
      nodes: [trigger, { id: 'pause', type: 'wait', config: { kind: 'until', until: '2027-01-15' } }],
      edges: [edge('start', 'pause')],
    });
    const { runId } = await runManually();
    temporal.onSleep = async () => {
      await owner.admin.from('accounts').update({ timezone: 'Pacific/Honolulu' }).eq('id', teamId).throwOnError();
    };

    await runPublishedWorkflow({ runId });

    expect(temporal.slept).toHaveLength(1);
    expect(await runStatus(runId)).toBe('succeeded');
  });

  it('waits its full duration from when it parks in a retried run, however long ago the step first started', async () => {
    await publish({
      nodes: [
        trigger,
        { id: 'pause', type: 'wait', config: { kind: 'duration', amount: 5, unit: 'minutes' } },
      ],
      edges: [edge('start', 'pause')],
    });
    const { runId } = await runManually();
    await recordStep(runId, 'pause', { status: 'failed', error: 'Timed out' });
    await owner.admin
      .from('workflow_step_run')
      .update({ started_at: new Date(Date.now() - 2 * 24 * HOUR).toISOString() })
      .eq('idempotency_key', `${runId}:pause:0`)
      .throwOnError();
    await setRunStatus(runId, 'failed');

    await retryWorkflowRun({ accountId: teamId, runId });
    await runPublishedWorkflow({ runId });

    expect(temporal.slept).toHaveLength(1);
    expect(temporal.slept[0]).toBeGreaterThan(4 * 60 * 1000);
  });
});

const asks = { id: 'ask', type: 'approval', config: { prompt: 'Go ahead?' } } as const;
const spends = {
  id: 'spend',
  type: 'create_todo',
  config: { title: 'Spend', assignees: { kind: 'deal_managers' } },
} as const;

async function recordDecision(stepRunKey: string, approved: boolean) {
  const { data: step } = await owner.admin
    .from('workflow_step_run')
    .select('id')
    .eq('idempotency_key', stepRunKey)
    .single()
    .throwOnError();
  await owner.user
    .from('workflow_approval')
    .insert({ step_run_id: step.id, account_id: teamId, approved })
    .throwOnError();
  return step.id;
}

describe('a step waiting on a person (integration)', () => {
  it('parks its path, shows awaiting approval only once nothing runs, takes a decision while the run is running, then carries on', async () => {
    await publish({
      nodes: [trigger, asks, notify('busy', 'Busy path'), notify('after', 'After the decision')],
      edges: [edge('start', 'ask'), edge('start', 'busy'), exit('ask', 'approved', 'after')],
    });
    const { runId } = await runManually();
    let askParked!: () => void;
    const parked = new Promise<void>((resolve) => (askParked = resolve));
    const seen: string[] = [];
    managers.beforeLookup = async () => {
      managers.beforeLookup = async () => {};
      await parked;
      seen.push(await runStatus(runId));
      await recordDecision(`${runId}:ask:0`, true);
    };
    temporal.onWait = async () => {
      askParked();
      await expect.poll(() => runStatus(runId), { timeout: 15_000 }).toBe('awaiting_approval');
      seen.push('awaiting_approval');
    };

    await runPublishedWorkflow({ runId });

    expect(seen).toEqual(['running', 'awaiting_approval']);
    expect(await notificationCounts('Pipeline review reminder is waiting for approval')).toEqual({
      [owner.userId]: 1,
      [managerId]: 1,
    });
    expect(await stepRow(runId, 'ask')).toMatchObject({
      status: 'succeeded',
      output: { asked: true, approved: true },
    });
    expect(await runStatus(runId)).toBe('succeeded');
    expect(await notificationCounts('After the decision')).toEqual({
      [owner.userId]: 1,
      [managerId]: 1,
    });
  });

  it('follows the rejected handle when the person says no', async () => {
    await publish({
      nodes: [trigger, asks, notify('yes', 'Approved path'), notify('no', 'Rejected path')],
      edges: [edge('start', 'ask'), exit('ask', 'approved', 'yes'), exit('ask', 'rejected', 'no')],
    });
    const { runId } = await runManually();
    temporal.onWait = async () => {
      await recordDecision(`${runId}:ask:0`, false);
    };

    await runPublishedWorkflow({ runId });

    expect(await stepRow(runId, 'ask')).toMatchObject({
      status: 'succeeded',
      output: { asked: true, approved: false },
    });
    expect(await notificationCounts('Rejected path')).toEqual({ [owner.userId]: 1, [managerId]: 1 });
    expect(await stepRow(runId, 'yes')).toBeNull();
  });

  it('can be cancelled while it waits on a person', async () => {
    await publish({
      nodes: [trigger, asks, notify('after', 'After the decision')],
      edges: [edge('start', 'ask'), exit('ask', 'approved', 'after')],
    });
    const { runId } = await runManually();
    temporal.onWait = async () => {
      await cancelWorkflowRun({ accountId: teamId, runId });
    };

    await runPublishedWorkflow({ runId });

    expect(await runStatus(runId)).toBe('cancelled');
    expect(await stepRow(runId, 'ask')).toMatchObject({ status: 'cancelled' });
    expect(await stepRow(runId, 'after')).toBeNull();
  });

  it('signals the run when a decision is recorded, only for its own step and team', async () => {
    await publish(oneStepGraph);
    const { runId } = await runManually();
    await recordStep(runId, 'notify', { status: 'running' });
    const { data: step } = await owner.admin
      .from('workflow_step_run')
      .select('id')
      .eq('run_id', runId)
      .single()
      .throwOnError();

    await signalApprovalDecided({ accountId: teamId, runId, stepRunId: step.id });
    for (const wrong of [
      { accountId: crypto.randomUUID(), runId, stepRunId: step.id },
      { accountId: teamId, runId, stepRunId: crypto.randomUUID() },
    ]) {
      await expect(signalApprovalDecided(wrong)).rejects.toMatchObject({ reason: 'run_changed' });
    }

    expect(temporal.signal.mock.calls).toEqual([[`workflow-run-${runId}`, 'approvalDecided']]);
  });

  it('notices the managers once while it waits, keeps the run awaiting approval across rechecks, and survives a failing notice', async () => {
    await publish({
      nodes: [trigger, asks, notify('after', 'After the decision')],
      edges: [edge('start', 'ask'), exit('ask', 'approved', 'after')],
    });
    const { runId } = await runManually();
    const statuses: string[] = [];
    let noticeCalls = 0;
    temporal.fault = async (activity, input) => {
      if (activity === 'transitionWorkflowRun') {
        statuses.push((input as { to: string }).to);
      }
      if (activity === 'notifyApprovalWaiting') {
        noticeCalls += 1;
        throw new Error('Novu unavailable');
      }
    };
    let waits = 0;
    temporal.onWait = async () => {
      waits += 1;
      if (waits === 3) {
        await recordDecision(`${runId}:ask:0`, true);
      }
    };

    await runPublishedWorkflow({ runId });

    expect(noticeCalls).toBe(1);
    expect(statuses).toEqual(['awaiting_approval', 'running', 'succeeded']);
    expect(await runStatus(runId)).toBe('succeeded');
  });
});

describe('a monthly cap (integration)', () => {
  async function setCaps(caps: { ai_monthly_cap?: number; lookup_monthly_cap?: number }) {
    await owner.admin
      .from('outreach_setting')
      .upsert({ account_id: teamId, daily_cap: 20, ...caps }, { onConflict: 'account_id' })
      .throwOnError();
  }

  it('pauses the run before an AI call past the cap, tells the managers once, and resumes when the cap is raised', async () => {
    await setCaps({ ai_monthly_cap: 1 });
    await owner.admin
      .from('ai_call_log')
      .insert({ account_id: teamId, model: 'test-model' })
      .throwOnError();
    await publish({
      nodes: [trigger, spends, notify('after', 'After the AI step')],
      edges: [edge('start', 'spend'), edge('spend', 'after')],
    });
    const { runId } = await runManually();
    const seen: string[] = [];
    let waits = 0;
    temporal.onWait = async () => {
      waits += 1;
      seen.push(await runStatus(runId));
      if (waits === 2) {
        await setCaps({ ai_monthly_cap: 2 });
        await resumeCappedRuns({ accountId: teamId });
      }
    };

    await runPublishedWorkflow({ runId });

    expect(seen).toEqual(['paused_cap', 'paused_cap']);
    const now = new Date();
    const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
    expect(Math.abs((temporal.conditionTimeouts[0] as number) - (monthStart - Date.now()))).toBeLessThan(60_000);
    expect(temporal.signal.mock.calls).toEqual([[`workflow-run-${runId}`, 'capRaised']]);
    expect(await runStatus(runId)).toBe('succeeded');
    expect(await notificationCounts('Pipeline review reminder paused: the monthly AI limit is reached')).toEqual({
      [owner.userId]: 1,
      [managerId]: 1,
    });
    expect(await notificationCounts('After the AI step')).toEqual({
      [owner.userId]: 1,
      [managerId]: 1,
    });
  });

  it('reserves AI calls atomically so two at once cannot pass a cap of one, then records usage', async () => {
    await setCaps({ ai_monthly_cap: 1 });

    const outcomes = await Promise.allSettled([
      reserveAiCall(teamId, { model: 'test-model', endpointId: null }),
      reserveAiCall(teamId, { model: 'test-model', endpointId: null }),
    ]);

    const reserved = outcomes.flatMap((outcome) => (outcome.status === 'fulfilled' ? [outcome.value] : []));
    const refused = outcomes.flatMap((outcome) => (outcome.status === 'rejected' ? [outcome.reason] : []));
    expect(reserved).toHaveLength(1);
    expect(refused).toHaveLength(1);
    expect(refused[0]).toBeInstanceOf(CapReached);

    await recordAiCallUsage(reserved[0]!.callId, { promptTokens: 12, completionTokens: 34 });
    const { data: logged } = await owner.admin
      .from('ai_call_log')
      .select('model, prompt_tokens, completion_tokens')
      .eq('account_id', teamId)
      .throwOnError();
    expect(logged).toEqual([{ model: 'test-model', prompt_tokens: 12, completion_tokens: 34 }]);
  });

  it('keeps going when the pause notice fails', async () => {
    await setCaps({ ai_monthly_cap: 0 });
    await publish({
      nodes: [trigger, spends],
      edges: [edge('start', 'spend')],
    });
    const { runId } = await runManually();
    temporal.fault = async (activity) => {
      if (activity === 'notifyRunPaused') {
        throw new Error('Novu unavailable');
      }
    };
    temporal.onWait = async () => {
      await setCaps({ ai_monthly_cap: 5 });
    };

    await runPublishedWorkflow({ runId });

    expect(await runStatus(runId)).toBe('succeeded');
  });
});

describe('a run started by an event (integration)', () => {
  const eventGraph: WorkflowGraph = {
    nodes: [
      { id: 'onOffer', type: 'event_trigger', config: { eventType: 'offer.submitted' } },
      notify('tell', '{{steps.onOffer.eventType}} for {{steps.onOffer.amount}} on {{steps.onOffer.dealId}}'),
    ],
    edges: [edge('onOffer', 'tell')],
  };
  const dealId = '11111111-1111-4111-8111-111111111111';

  async function latestVersion() {
    const { data } = await owner.admin
      .from('workflow_version')
      .select('id')
      .eq('workflow_id', workflowId)
      .order('published_at', { ascending: false })
      .limit(1)
      .single()
      .throwOnError();
    return data.id;
  }

  async function enable() {
    const { data } = await owner.admin
      .from('workflow')
      .update({ enabled: true })
      .eq('id', workflowId)
      .select('enabled_after_deal_seq, enabled_after_account_seq')
      .single()
      .throwOnError();
    return { deal: Number(data.enabled_after_deal_seq), account: Number(data.enabled_after_account_seq) };
  }

  async function startFor(log: 'deal' | 'account', globalSeq: number) {
    return startEventRun({
      accountId: teamId,
      workflowId,
      versionId: await latestVersion(),
      nodeId: 'onOffer',
      event: { log, globalSeq, eventType: 'offer.submitted', dealId, payload: { amount: 250000 } },
    });
  }

  it('starts one run per trigger node, log and sequence, and refuses a disabled workflow', async () => {
    await publish(eventGraph);

    expect(await startFor('deal', 42)).toEqual({ refused: 'disabled' });
    const marks = await enable();
    const first = await startFor('deal', marks.deal + 1);
    const again = await startFor('deal', marks.deal + 1);
    await startFor('account', marks.account + 1);

    expect(again).toEqual(first);
    const { data: runs } = await owner.admin
      .from('workflow_run')
      .select('trigger_kind, trigger_ref, trigger_node_id')
      .eq('workflow_id', workflowId)
      .order('trigger_ref')
      .throwOnError();
    expect(runs).toEqual([
      { trigger_kind: 'event', trigger_ref: `onOffer@account:${marks.account + 1}`, trigger_node_id: 'onOffer' },
      { trigger_kind: 'event', trigger_ref: `onOffer@deal:${marks.deal + 1}`, trigger_node_id: 'onOffer' },
    ]);
  });

  it('refuses an event at or before its log mark from when the workflow was enabled', async () => {
    await publish(eventGraph);
    const marks = await enable();

    expect(await startFor('deal', marks.deal)).toEqual({ refused: 'before_enabled' });
    expect(await startFor('account', marks.account)).toEqual({ refused: 'before_enabled' });
    expect(await runCount()).toBe(0);
  });

  it('creates the run of a team locked for billing so it pauses like any run', async () => {
    await publish(eventGraph);
    const marks = await enable();
    const unlock = await lockTeam();

    try {
      expect(await startFor('deal', marks.deal + 1)).toEqual({ runId: expect.any(String) });
    } finally {
      await unlock();
    }
  });

  it('hands the event to the steps as the trigger output', async () => {
    await publish(eventGraph);
    const marks = await enable();
    const started = await startFor('deal', marks.deal + 1);

    await runPublishedWorkflow({ runId: (started as { runId: string }).runId });

    expect(await notificationCounts(`offer.submitted for 250000 on ${dealId}`)).toEqual({
      [owner.userId]: 1,
      [managerId]: 1,
    });
  });
});


describe('a workflow with AI steps (integration)', () => {
  const aiGraph = {
    nodes: [trigger, { id: 'think', type: 'ask_ai', config: { prompt: 'Summarise', output: 'text' } }],
    edges: [edge('start', 'think')],
  } as unknown as WorkflowGraph;

  async function connectAi() {
    await owner.user
      .rpc('save_llm_endpoint', {
        p_account_id: teamId,
        p_provider: 'openai',
        p_model: 'gpt-test',
        p_base_url: 'https://ai.test/v1',
        p_api_key: 'sk-test',
      })
      .throwOnError();
  }

  it('tells publishing whether a graph needs an AI provider the team has not connected', async () => {
    const plainGraph = { nodes: [{ type: 'manual_trigger' }, { type: 'notify_team' }] };
    const aiNodes = { nodes: [{ type: 'manual_trigger' }, { type: 'decision_model' }] };

    expect(await aiProviderProblem(teamId, plainGraph)).toBeNull();
    expect(await aiProviderProblem(teamId, aiNodes)).toBe('Connect an AI provider first');
    await connectAi();
    expect(await aiProviderProblem(teamId, aiNodes)).toBeNull();
  });

  it('fails at once when the team has no usable AI provider', async () => {
    await owner.admin
      .from('llm_endpoint')
      .insert({ account_id: teamId, provider: 'openai', model: 'gpt-test' })
      .throwOnError();
    await publish(aiGraph);

    const runId = await runToEnd();

    expect(await runRecord(runId)).toEqual({ status: 'failed', error: 'Connect an AI provider first' });
  });

  it('gives an AI step longer than its provider call, heartbeats it and hands it the cancellation signal', async () => {
    await connectAi();
    await publish({
      nodes: [...(aiGraph.nodes as WorkflowNode[]), notify('after', 'After thinking')],
      edges: [...aiGraph.edges, edge('think', 'after')],
    });

    await runToEnd();

    const executions = temporal.timeouts.filter(([name]) => name === 'executeWorkflowStep');
    expect(executions.map(([, timeout, heartbeat]) => [timeout, heartbeat])).toEqual([
      ['150 seconds', '30 seconds'],
      ['5 minutes', undefined],
    ]);
    expect(activityContext.heartbeat).toHaveBeenCalled();
    expect(activityContext.seenSignals).toEqual([activityContext.cancellation.signal]);
  });

  it('runs a decision model again after its cap is raised, then waits for the decision', async () => {
    await connectAi();
    await owner.admin
      .from('outreach_setting')
      .upsert({ account_id: teamId, daily_cap: 20, ai_monthly_cap: 0 }, { onConflict: 'account_id' })
      .throwOnError();
    await publish({
      nodes: [
        trigger,
        { id: 'vet', type: 'decision_model', config: { firmId: crypto.randomUUID(), instructions: 'Fit?' } },
        notify('no', 'Rejected firm'),
      ],
      edges: [edge('start', 'vet'), exit('vet', 'rejected', 'no')],
    } as unknown as WorkflowGraph);
    const { runId } = await runManually();
    let waits = 0;
    temporal.onWait = async () => {
      waits += 1;
      if (waits === 1) {
        await owner.admin
          .from('outreach_setting')
          .update({ ai_monthly_cap: 5 })
          .eq('account_id', teamId)
          .throwOnError();
      } else {
        const { data: step } = await owner.admin
          .from('workflow_step_run')
          .select('id')
          .eq('idempotency_key', `${runId}:vet:0`)
          .single()
          .throwOnError();
        await owner.user
          .rpc('decide_firm_verdict', {
            p_step_run_id: step.id,
            p_verdict_id: 'a7000000-0000-4000-8000-000000000001',
            p_approved: false,
          })
          .throwOnError();
      }
    };

    await runPublishedWorkflow({ runId });

    expect(await stepRow(runId, 'vet')).toMatchObject({
      status: 'succeeded',
      output: { verdictId: 'a7000000-0000-4000-8000-000000000001', fit: true, approved: false },
    });
    expect(await notificationCounts('Rejected firm')).toEqual({ [owner.userId]: 1, [managerId]: 1 });
  });
});
