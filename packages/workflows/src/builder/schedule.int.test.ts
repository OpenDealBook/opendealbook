import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  provisionAccount,
  type IntegrationAccount,
} from '../../test-support/integration-harness';
import { ScheduleNotFoundError, type ScheduleOptions } from '@temporalio/client';

import { fakeScheduleClient } from '../schedules/fakeScheduleClient';

const temporal = vi.hoisted(() => ({
  schedule: undefined as unknown,
  fireTime: new Date(),
  createFails: (_scheduleId: string): boolean => false,
  createdPaused: new Map<string, boolean | undefined>(),
  start: vi.fn(async (_type: string, _options: { workflowId: string; args: unknown[] }) => undefined),
  warn: vi.fn((_message: string, _attributes: unknown) => undefined),
}));

vi.mock('../client', () => ({
  TASK_QUEUE: 'opendealbook',
  getTemporalClient: async () => ({
    schedule: temporal.schedule,
    workflow: {
      start: temporal.start,
      getHandle: () => ({ describe: async () => ({ startTime: new Date() }) }),
    },
  }),
}));

vi.mock('@temporalio/workflow', async () => {
  const { startScheduledRun } = await import('./client');

  return {
    proxyActivities: () => ({ startScheduledRun }),
    log: { warn: temporal.warn },
    workflowInfo: () => ({ typedSearchAttributes: { get: () => temporal.fireTime } }),
  };
});

import type { NodeConfig, WorkflowGraph } from './graph';
import {
  SchedulesPartlyUpdated,
  scheduleSpec,
  syncTeamSchedules,
  syncWorkflowSchedules,
} from './schedule';
import { runScheduledTrigger } from './scheduleWorkflow';

const TIME_ZONE = 'America/Chicago';
const weekly = { every: 'week', weekday: 'monday', at: '08:30' } as const;

let owner: IntegrationAccount;
let teamId: string;
let workflowId: string;
let schedules: ReturnType<typeof fakeScheduleClient>['schedules'];

function graphWith(
  ...triggers: { id: string; config: NodeConfig<'schedule_trigger'> }[]
): WorkflowGraph {
  return {
    nodes: [
      ...triggers.map((trigger) => ({ ...trigger, type: 'schedule_trigger' as const })),
      { id: 'notify', type: 'notify_team', config: { message: 'Weekly review' } },
    ],
    edges: triggers.map((trigger) => ({
      id: `${trigger.id}-notify`,
      sourceNodeId: trigger.id,
      targetNodeId: 'notify',
    })),
  };
}

async function publish(graph: WorkflowGraph): Promise<string> {
  const { data } = await owner.admin
    .from('workflow_version')
    .insert({
      account_id: teamId,
      workflow_id: workflowId,
      schema_version: 2,
      graph,
      published_at: new Date().toISOString(),
      published_by: owner.userId,
    })
    .select('id')
    .single()
    .throwOnError();
  return data.id;
}

async function setWorkflow(patch: { enabled?: boolean; archived_at?: string | null }) {
  await owner.admin.from('workflow').update(patch).eq('id', workflowId).throwOnError();
}

async function sync() {
  await syncWorkflowSchedules({ accountId: teamId, workflowId });
}

async function setTeamTimezone(timezone: string) {
  await owner.admin.from('accounts').update({ timezone }).eq('id', teamId).throwOnError();
}

async function triggerRow(versionId: string, nodeId: string) {
  const { data } = await owner.admin
    .from('workflow_trigger')
    .select('kind, temporal_schedule_id')
    .eq('version_id', versionId)
    .eq('node_id', nodeId)
    .single()
    .throwOnError();
  expect(data.kind).toBe('schedule');
  return data;
}

async function scheduleOf(versionId: string, nodeId: string) {
  return schedules.get((await triggerRow(versionId, nodeId)).temporal_schedule_id!);
}

async function runs() {
  const { data } = await owner.admin
    .from('workflow_run')
    .select('id, version_id, trigger_kind, trigger_ref, trigger_node_id')
    .eq('workflow_id', workflowId)
    .throwOnError();
  return data;
}

beforeEach(async () => {
  const fake = fakeScheduleClient();
  schedules = fake.schedules;
  temporal.schedule = {
    create: async (options: ScheduleOptions) => {
      if (temporal.createFails(options.scheduleId)) {
        throw new Error('scheduler unreachable');
      }
      temporal.createdPaused.set(options.scheduleId, options.state?.paused);
      await fake.client.schedule.create(options);
    },
    getHandle: (scheduleId: string) => ({
      ...fake.client.schedule.getHandle(scheduleId),
      delete: async () => {
        if (!schedules.delete(scheduleId)) {
          throw new ScheduleNotFoundError('not found', scheduleId);
        }
      },
    }),
  };
  temporal.start.mockReset();
  temporal.warn.mockReset();
  temporal.createFails = () => false;
  temporal.createdPaused.clear();
  owner = await provisionAccount();
  teamId = owner.accountId;
  await setTeamTimezone(TIME_ZONE);

  const { data: workflow } = await owner.admin
    .from('workflow')
    .insert({ account_id: teamId, name: 'Weekly review' })
    .select('id')
    .single()
    .throwOnError();
  workflowId = workflow.id;
});

afterEach(async () => {
  await owner.admin.from('workflow_run').delete().eq('account_id', teamId);
  await owner.admin.from('accounts').delete().eq('id', teamId);
  await owner.cleanup();
});

describe('syncWorkflowSchedules (integration)', () => {
  it('gives each schedule trigger of an enabled workflow one running schedule in the team timezone, recorded on its trigger row', async () => {
    const versionId = await publish(
      graphWith({ id: 'weekly', config: weekly }, { id: 'month-end', config: { every: 'month', day: 31, at: '07:00' } }),
    );
    await setWorkflow({ enabled: true });

    await sync();
    await sync();

    expect(schedules.size).toBe(2);
    expect(await scheduleOf(versionId, 'weekly')).toMatchObject({
      spec: scheduleSpec(weekly, TIME_ZONE),
      state: { paused: false },
      action: {
        type: 'startWorkflow',
        workflowType: 'runScheduledTrigger',
        taskQueue: 'opendealbook',
        args: [{ accountId: teamId, workflowId, versionId, nodeId: 'weekly', timeZone: TIME_ZONE }],
      },
    });
    expect(await scheduleOf(versionId, 'month-end')).toMatchObject({
      spec: scheduleSpec({ every: 'month', day: 31, at: '07:00' }, TIME_ZONE),
      state: { paused: false },
    });
  });

  it('pauses the schedules of a disabled workflow and runs them again once it is enabled', async () => {
    const versionId = await publish(graphWith({ id: 'weekly', config: weekly }));

    await sync();
    expect((await scheduleOf(versionId, 'weekly'))?.state?.paused).toBe(true);

    await setWorkflow({ enabled: true });
    await sync();
    expect((await scheduleOf(versionId, 'weekly'))?.state?.paused).toBe(false);

    await setWorkflow({ enabled: false });
    await sync();
    expect((await scheduleOf(versionId, 'weekly'))?.state?.paused).toBe(true);
  });

  it('pauses the schedules of an archived workflow', async () => {
    const versionId = await publish(graphWith({ id: 'weekly', config: weekly }));
    await setWorkflow({ enabled: true });
    await sync();

    await setWorkflow({ enabled: false, archived_at: new Date().toISOString() });
    await sync();

    expect((await scheduleOf(versionId, 'weekly'))?.state?.paused).toBe(true);
  });

  it('deletes the schedules of an older version once a newer one is published and clears them from its trigger rows', async () => {
    const older = await publish(graphWith({ id: 'weekly', config: weekly }));
    await setWorkflow({ enabled: true });
    await sync();

    const daily = { every: 'day', at: '06:00' } as const;
    const newer = await publish(graphWith({ id: 'weekly', config: daily }));
    await sync();

    expect(await triggerRow(older, 'weekly')).toEqual({ kind: 'schedule', temporal_schedule_id: null });
    expect(schedules.size).toBe(1);
    expect(await scheduleOf(newer, 'weekly')).toMatchObject({
      spec: scheduleSpec(daily, TIME_ZONE),
      state: { paused: false },
    });
  });

  it('clears an older version schedule that a previous sync deleted before it could clear the row', async () => {
    const older = await publish(graphWith({ id: 'weekly', config: weekly }));
    await sync();
    schedules.delete((await triggerRow(older, 'weekly')).temporal_schedule_id!);

    await publish(graphWith({ id: 'weekly', config: weekly }));
    await sync();

    expect(await triggerRow(older, 'weekly')).toEqual({ kind: 'schedule', temporal_schedule_id: null });
  });

  it('creates the schedule of a disabled workflow already paused', async () => {
    const versionId = await publish(graphWith({ id: 'weekly', config: weekly }));

    await sync();

    const { temporal_schedule_id } = await triggerRow(versionId, 'weekly');
    expect(temporal.createdPaused.get(temporal_schedule_id!)).toBe(true);
  });

  it('tracks a schedule whose creation failed and creates it on the next sync', async () => {
    const versionId = await publish(graphWith({ id: 'weekly', config: weekly }));
    await setWorkflow({ enabled: true });
    temporal.createFails = () => true;

    await expect(sync()).rejects.toThrow('scheduler unreachable');
    const { temporal_schedule_id } = await triggerRow(versionId, 'weekly');
    expect(temporal_schedule_id).not.toBeNull();

    temporal.createFails = () => false;
    await sync();

    expect(schedules.get(temporal_schedule_id!)).toMatchObject({ state: { paused: false } });
  });

  it('makes no schedule for a workflow that was never published', async () => {
    await sync();

    expect(schedules.size).toBe(0);
  });
});

describe('syncTeamSchedules (integration)', () => {
  it('moves every workflow schedule of the team to the team timezone', async () => {
    const first = await publish(graphWith({ id: 'weekly', config: weekly }));
    await sync();
    const firstWorkflowId = workflowId;
    const { data: second } = await owner.admin
      .from('workflow')
      .insert({ account_id: teamId, name: 'Month end close' })
      .select('id')
      .single()
      .throwOnError();
    workflowId = second.id;
    const secondVersion = await publish(graphWith({ id: 'weekly', config: weekly }));
    await sync();

    await setTeamTimezone('Europe/London');
    await syncTeamSchedules({ accountId: teamId });

    for (const [versionId, owningWorkflowId] of [
      [first, firstWorkflowId],
      [secondVersion, second.id],
    ] as const) {
      expect(await scheduleOf(versionId, 'weekly')).toMatchObject({
        spec: scheduleSpec(weekly, 'Europe/London'),
        action: { args: [{ workflowId: owningWorkflowId, timeZone: 'Europe/London' }] },
      });
    }
  });

  it('syncs every workflow even when some fail, then reports how many failed', async () => {
    const workflowIds: string[] = [];
    const versionIds: string[] = [];
    for (const name of ['First', 'Second', 'Third']) {
      const { data } = await owner.admin
        .from('workflow')
        .insert({ account_id: teamId, name })
        .select('id')
        .single()
        .throwOnError();
      workflowId = data.id;
      workflowIds.push(data.id);
      versionIds.push(await publish(graphWith({ id: 'weekly', config: weekly })));
    }
    temporal.createFails = (scheduleId) => !scheduleId.includes(versionIds[1]!);

    const failure = await syncTeamSchedules({ accountId: teamId }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(SchedulesPartlyUpdated);
    expect(failure).toMatchObject({
      failed: 2,
      total: 5,
      message: "2 of 5 workflows' schedules couldn't be updated; try again",
    });
    expect(await scheduleOf(versionIds[1]!, 'weekly')).toMatchObject({
      spec: scheduleSpec(weekly, TIME_ZONE),
    });
  });
});

describe('a schedule firing (integration)', () => {
  it('starts one run after its trigger node under the scheduled fire time, even when the fire is delivered twice', async () => {
    const versionId = await publish(graphWith({ id: 'weekly', config: weekly }));
    await setWorkflow({ enabled: true });
    temporal.fireTime = new Date('2027-03-01T14:30:00.000Z');
    const trigger = { accountId: teamId, workflowId, versionId, nodeId: 'weekly', timeZone: TIME_ZONE };

    await runScheduledTrigger(trigger);
    await runScheduledTrigger(trigger);

    const [run, ...others] = await runs();
    expect(others).toEqual([]);
    expect(run).toEqual({
      id: expect.any(String),
      version_id: versionId,
      trigger_kind: 'schedule',
      trigger_ref: 'weekly@2027-03-01T08:30',
      trigger_node_id: 'weekly',
    });
    expect(temporal.start).toHaveBeenCalledWith(
      'runPublishedWorkflow',
      expect.objectContaining({ workflowId: `workflow-run-${run!.id}`, args: [{ runId: run!.id }] }),
    );
  });

  it('starts one run for a local time that repeats when the clocks fall back', async () => {
    const versionId = await publish(graphWith({ id: 'nightly', config: { every: 'day', at: '01:30' } }));
    await setWorkflow({ enabled: true });
    const trigger = { accountId: teamId, workflowId, versionId, nodeId: 'nightly', timeZone: TIME_ZONE };

    temporal.fireTime = new Date('2027-11-07T06:30:00.000Z');
    await runScheduledTrigger(trigger);
    temporal.fireTime = new Date('2027-11-07T07:30:00.000Z');
    await runScheduledTrigger(trigger);

    expect((await runs()).map((run) => run.trigger_ref)).toEqual(['nightly@2027-11-07T01:30']);
  });

  it('starts a run for each schedule trigger that fires in the same minute', async () => {
    const versionId = await publish(
      graphWith({ id: 'weekly', config: weekly }, { id: 'also-weekly', config: weekly }),
    );
    await setWorkflow({ enabled: true });
    temporal.fireTime = new Date('2027-03-01T14:30:00.000Z');

    for (const nodeId of ['weekly', 'also-weekly']) {
      await runScheduledTrigger({ accountId: teamId, workflowId, versionId, nodeId, timeZone: TIME_ZONE });
    }

    expect((await runs()).map((run) => run.trigger_ref).sort()).toEqual([
      'also-weekly@2027-03-01T08:30',
      'weekly@2027-03-01T08:30',
    ]);
  });
});

describe('a schedule firing that must not start a run (integration)', () => {
  const HOUR = 60 * 60 * 1000;

  async function fire(versionId: string) {
    temporal.fireTime = new Date('2027-03-01T14:30:00.000Z');
    await runScheduledTrigger({ accountId: teamId, workflowId, versionId, nodeId: 'weekly', timeZone: TIME_ZONE });
  }

  function refusedFor() {
    return temporal.warn.mock.calls.map(([, attributes]) => (attributes as { reason: string }).reason);
  }

  it('records a refusal and starts nothing for a disabled, archived or superseded workflow', async () => {
    const older = await publish(graphWith({ id: 'weekly', config: weekly }));

    await fire(older);
    await setWorkflow({ archived_at: new Date().toISOString() });
    await fire(older);
    await setWorkflow({ archived_at: null });
    await publish(graphWith({ id: 'weekly', config: weekly }));
    await setWorkflow({ enabled: true });
    await fire(older);

    expect(refusedFor()).toEqual(['disabled', 'archived', 'superseded']);
    expect(await runs()).toEqual([]);
    expect(temporal.start).not.toHaveBeenCalled();
  });

  it('records a refusal and starts nothing while the team is locked', async () => {
    const versionId = await publish(graphWith({ id: 'weekly', config: weekly }));
    await setWorkflow({ enabled: true });
    const { data: config } = await owner.admin
      .from('config')
      .select('enable_team_account_billing')
      .single()
      .throwOnError();
    await owner.admin.rpc('set_team_account_billing', { enabled: true }).throwOnError();
    await owner.admin
      .from('accounts')
      .update({ trial_ends_at: new Date(Date.now() - 24 * HOUR).toISOString() })
      .eq('id', teamId)
      .throwOnError();

    try {
      await fire(versionId);
    } finally {
      await owner.admin
        .rpc('set_team_account_billing', { enabled: config.enable_team_account_billing })
        .throwOnError();
    }

    expect(refusedFor()).toEqual(['team_locked']);
    expect(await runs()).toEqual([]);
  });
});
