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
}));

const managers = vi.hoisted(() => ({ beforeLookup: async () => {} }));

vi.mock('../dealManagers', async (importOriginal) => {
  const { dealManagerIds } = await importOriginal<typeof import('../dealManagers')>();
  return {
    dealManagerIds: async (accountId: string) => {
      await managers.beforeLookup();
      return dealManagerIds(accountId);
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

  return {
    proxyActivities: () => ({ ...builderActivities, isTeamLocked }),
    defineSignal: (name: string) => name,
    setHandler: () => {},
    condition: async () => {
      await temporal.onWait();
      return false;
    },
  };
});

import { WorkflowNotFoundError } from '@temporalio/client';
import { ApplicationFailure } from '@temporalio/common';

import {
  executeWorkflowStep,
  failWorkflowStep,
  transitionWorkflowRun,
} from './activities';
import {
  cancelWaitingRuns,
  cancelWorkflowRun,
  ManualRunRefused,
  resumeLockedWorkflowRuns,
  retryWorkflowRun,
  RunActionRefused,
  startManualWorkflowRun,
} from './client';
import type { WorkflowGraph } from './graph';
import { runPublishedWorkflow } from './workflow';

const HOUR = 60 * 60 * 1000;
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
      iteration: 0,
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
        { id: 'broken', type: 'notify_team', config: { message: '' } },
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
      error: expect.stringContaining('message'),
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
      iteration: 0,
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
      config: { message: '' },
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
      iteration: 0,
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
      nodes: [trigger, { id: 'broken', type: 'notify_team', config: { message: '' } }],
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
          iteration: 0,
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
      iteration: 0,
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
      iteration: 0,
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
      iteration: 0,
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
    const fail = { runId, from: 'running', to: 'failed' } as const;

    await expect(transitionWorkflowRun(fail)).rejects.toThrow('Novu unavailable');
    await transitionWorkflowRun(fail);

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
