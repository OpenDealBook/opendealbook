import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  provisionAccount,
  type IntegrationAccount,
} from '../../test-support/integration-harness';

const temporal = vi.hoisted(() => ({
  start: vi.fn(async (_type: string, _options: unknown) => undefined),
  signal: vi.fn(async (_workflowId: string, _signal: string) => undefined),
  onWait: async () => {},
}));

vi.mock('../client', () => ({
  TASK_QUEUE: 'opendealbook',
  getTemporalClient: async () => ({
    workflow: {
      start: temporal.start,
      getHandle: (workflowId: string) => ({
        signal: (signal: string) => temporal.signal(workflowId, signal),
      }),
    },
  }),
}));

vi.mock('@temporalio/activity', () => ({
  Context: { current: () => ({ info: { attempt: 1 } }) },
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

import { ApplicationFailure } from '@temporalio/common';

import { executeWorkflowStep, transitionWorkflowRun } from './activities';
import {
  ManualRunRefused,
  resumeLockedWorkflowRuns,
  startManualWorkflowRun,
} from './client';
import type { WorkflowGraph } from './graph';
import { runPublishedWorkflow } from './workflow';

const HOUR = 60 * 60 * 1000;
const message = 'Weekly pipeline review is due';

let owner: IntegrationAccount;
let teamId: string;
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
  const { args, workflowId: temporalWorkflowId } = options as {
    args: [{ runId: string }];
    workflowId: string;
  };
  expect(type).toBe('runPublishedWorkflow');
  expect(args).toEqual([{ runId: expect.any(String) }]);
  expect(temporalWorkflowId).toBe(`workflow-run-${args[0].runId}`);
  return args[0];
}

async function lockTeam(): Promise<() => Promise<void>> {
  const { data: config } = await owner.admin
    .from('config')
    .select('enable_team_account_billing')
    .single()
    .throwOnError();
  await owner.admin
    .rpc('set_team_account_billing', { enabled: true })
    .throwOnError();
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
    await owner.admin
      .rpc('set_team_account_billing', {
        enabled: config.enable_team_account_billing,
      })
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
  temporal.signal.mockClear();
  temporal.onWait = async () => {};
  owner = await provisionAccount();

  const { data: team } = await owner.admin
    .rpc('create_team_account', {
      account_name: 'Workflow Partners',
      user_id: owner.userId,
      account_slug: `wfb-${crypto.randomUUID().slice(0, 8)}`,
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
