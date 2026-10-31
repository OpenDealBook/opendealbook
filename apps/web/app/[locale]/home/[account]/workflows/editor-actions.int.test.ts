import type { SupabaseClient } from '@supabase/supabase-js';

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  admin,
  cleanUp,
  provisionPerson,
  provisionTeam,
  type Person,
  withLockedTeam,
} from '@odb/seller-rooms/test-support/world.ts';

interface ScheduleOptions {
  scheduleId: string;
  state?: { paused?: boolean };
}

const world = vi.hoisted(() => ({
  client: null as unknown as SupabaseClient,
  schedules: new Map<string, ScheduleOptions>(),
  schedulerDown: false,
  whilePublishing: null as null | (() => Promise<unknown>),
}));

vi.mock('@odb/workflows/builder/client', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@odb/workflows/builder/client')>();

  return {
    ...original,
    aiProviderProblem: async (
      ...args: Parameters<typeof original.aiProviderProblem>
    ) => {
      await world.whilePublishing?.();
      return original.aiProviderProblem(...args);
    },
  };
});

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => world.client,
}));

vi.mock('@odb/workflows/client', () => ({
  TASK_QUEUE: 'opendealbook',
  getTemporalClient: async () => ({
    schedule: {
      create: async (options: ScheduleOptions) => {
        if (world.schedulerDown) {
          throw new Error('scheduler unreachable');
        }
        world.schedules.set(options.scheduleId, options);
      },
      getHandle: (scheduleId: string) => ({
        update: async (
          next: (previous: ScheduleOptions) => ScheduleOptions,
        ) => {
          world.schedules.set(
            scheduleId,
            next(world.schedules.get(scheduleId)!),
          );
        },
      }),
    },
  }),
}));

import {
  WORKFLOW_GRAPH_SCHEMA_VERSIONS,
  type WorkflowGraph,
} from '@odb/workflows/builder/client';

import { setWorkflowArchived, setWorkflowEnabled } from './actions';
import {
  createWorkflow,
  publishDraft,
  renameWorkflow,
  retryScheduleSync,
  saveDraft,
} from './editor-actions';

let owner: Person;
let member: Person;
let teamId: string;

const layout = {
  direction: 'RIGHT' as const,
  positions: { start: { x: 0, y: 0 } },
};

const publishable: WorkflowGraph = {
  nodes: [
    { id: 'start', type: 'manual_trigger' as const, config: {} },
    {
      id: 'daily',
      type: 'schedule_trigger' as const,
      config: { every: 'day', at: '08:30' },
    },
    {
      id: 'tell',
      type: 'notify_team' as const,
      config: { message: 'Run started' },
    },
    {
      id: 'digest',
      type: 'notify_team' as const,
      config: { message: 'Daily digest' },
    },
  ],
  edges: [
    { id: 'e1', sourceNodeId: 'start', targetNodeId: 'tell' },
    { id: 'e2', sourceNodeId: 'daily', targetNodeId: 'digest' },
  ],
};

function as(person: Person) {
  world.client = person.client;
}

async function versionsOf(workflowId: string) {
  const { data } = await admin
    .from('workflow_version')
    .select(
      'id, schema_version, graph, layout, published_at, published_by, saved_at',
    )
    .eq('workflow_id', workflowId)
    .order('created_at')
    .throwOnError();
  return data;
}

async function draftOf(workflowId: string) {
  return (await versionsOf(workflowId)).find(
    (version) => version.published_at === null,
  );
}

async function archive(workflowId: string) {
  await admin
    .from('workflow')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', workflowId)
    .throwOnError();
}

async function triggersOf(workflowId: string) {
  const { data } = await admin
    .from('workflow_trigger')
    .select('node_id, temporal_schedule_id')
    .eq('workflow_id', workflowId)
    .throwOnError();
  return data;
}

async function syncFailedAt(workflowId: string) {
  const { data } = await admin
    .from('workflow')
    .select('schedules_sync_failed_at')
    .eq('id', workflowId)
    .single()
    .throwOnError();
  return data.schedules_sync_failed_at;
}

async function newWorkflow(name = 'Quiet lender nudge'): Promise<string> {
  as(owner);
  const created = await createWorkflow({ accountId: teamId, name });
  if (!created.ok) {
    throw new Error(created.refusal);
  }
  return created.value.workflowId;
}

beforeAll(async () => {
  owner = await provisionPerson();
  member = await provisionPerson();
  teamId = await provisionTeam(owner, 'Harbor Holdings');
  await admin
    .from('accounts_memberships')
    .insert({
      account_id: teamId,
      user_id: member.userId,
      account_role: 'member',
    })
    .throwOnError();
});

afterAll(async () => {
  await cleanUp([teamId]);
});

beforeEach(() => {
  world.schedules.clear();
  world.schedulerDown = false;
  world.whilePublishing = null;
});

describe('createWorkflow', () => {
  it('creates a disabled workflow with a blank draft holding one manual trigger', async () => {
    const workflowId = await newWorkflow('Overdue notices');

    const { data: workflow } = await admin
      .from('workflow')
      .select('account_id, name, enabled')
      .eq('id', workflowId)
      .single()
      .throwOnError();
    expect(workflow).toEqual({
      account_id: teamId,
      name: 'Overdue notices',
      enabled: false,
    });
    expect(await versionsOf(workflowId)).toEqual([
      expect.objectContaining({
        schema_version: 2,
        graph: {
          nodes: [
            {
              id: 'run-now',
              type: 'manual_trigger',
              config: {},
              label: 'Run now',
            },
          ],
          edges: [],
        },
        layout: {},
        published_at: null,
      }),
    ]);
  });

  it('stamps the latest graph schema version the app knows', async () => {
    const workflowId = await newWorkflow();

    expect((await draftOf(workflowId))!.schema_version).toBe(
      Math.max(...WORKFLOW_GRAPH_SCHEMA_VERSIONS),
    );
  });

  it('refuses a member without workflows.manage and creates nothing', async () => {
    as(member);

    await expect(
      createWorkflow({ accountId: teamId, name: 'Sneaky' }),
    ).resolves.toEqual({
      ok: false,
      refusal: 'Changing a workflow needs workflows.manage',
    });
    const { data } = await admin
      .from('workflow')
      .select('id')
      .eq('account_id', teamId)
      .eq('name', 'Sneaky')
      .throwOnError();
    expect(data).toEqual([]);
  });
});

describe('saveDraft', () => {
  it('keeps one draft, holding the latest graph and layout, and says when it was saved', async () => {
    const workflowId = await newWorkflow();

    await saveDraft({ workflowId, graph: { nodes: [], edges: [] }, layout });
    const saved = await saveDraft({ workflowId, graph: publishable, layout });

    const versions = await versionsOf(workflowId);
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      graph: publishable,
      layout,
      published_at: null,
    });
    expect(saved).toEqual({
      ok: true,
      value: { savedAt: versions[0]!.saved_at },
    });
  });

  it('saves a draft that would not pass publish validation', async () => {
    const workflowId = await newWorkflow();
    const untriggered: WorkflowGraph = {
      nodes: [{ id: 'tell', type: 'notify_team', config: {} }],
      edges: [],
    };

    await expect(
      saveDraft({ workflowId, graph: untriggered, layout }),
    ).resolves.toMatchObject({ ok: true });
    expect((await draftOf(workflowId))!.graph).toEqual(untriggered);
  });

  it('refuses a malformed graph and keeps the saved draft', async () => {
    const workflowId = await newWorkflow();
    const before = await draftOf(workflowId);

    const refused = await saveDraft({
      workflowId,
      graph: {
        nodes: [{ id: 'x', type: 'teleport', config: {} }],
        edges: [],
      } as never,
      layout,
    });

    expect(refused.ok).toBe(false);
    expect(await draftOf(workflowId)).toEqual(before);
  });

  it('starts a new draft after a publish and leaves the published version alone', async () => {
    const workflowId = await newWorkflow();
    await saveDraft({ workflowId, graph: publishable, layout });
    await publishDraft({ workflowId });
    const [published] = await versionsOf(workflowId);

    await saveDraft({ workflowId, graph: { nodes: [], edges: [] }, layout });

    const versions = await versionsOf(workflowId);
    expect(versions).toEqual([
      published,
      expect.objectContaining({
        graph: { nodes: [], edges: [] },
        published_at: null,
      }),
    ]);
  });

  it('keeps one draft when two first saves arrive together', async () => {
    const workflowId = await newWorkflow();
    await saveDraft({ workflowId, graph: publishable, layout });
    await publishDraft({ workflowId });

    const saves = await Promise.all(
      [1, 2, 3].map(() =>
        saveDraft({ workflowId, graph: publishable, layout }),
      ),
    );

    expect(saves.map((save) => save.ok)).toEqual([true, true, true]);
    expect(
      (await versionsOf(workflowId)).filter(
        (version) => version.published_at === null,
      ),
    ).toHaveLength(1);
  });

  it('refuses more than 200 steps and keeps the saved draft', async () => {
    const workflowId = await newWorkflow();
    const before = await draftOf(workflowId);
    const nodes = Array.from({ length: 201 }, (_, index) => ({
      id: `tell-${index}`,
      type: 'notify_team' as const,
      config: { message: 'Hi' },
    }));

    await expect(
      saveDraft({ workflowId, graph: { nodes, edges: [] }, layout }),
    ).resolves.toEqual({
      ok: false,
      refusal: 'A workflow can have at most 200 steps',
    });
    expect(await draftOf(workflowId)).toEqual(before);
  });

  it('refuses to save an archived workflow and keeps its draft', async () => {
    const workflowId = await newWorkflow();
    const before = await draftOf(workflowId);
    await archive(workflowId);

    await expect(
      saveDraft({ workflowId, graph: publishable, layout }),
    ).resolves.toEqual({ ok: false, refusal: 'Unarchive this workflow first' });
    expect(await draftOf(workflowId)).toEqual(before);
  });

  it('refuses a member and leaves the draft unchanged', async () => {
    const workflowId = await newWorkflow();
    const before = await draftOf(workflowId);
    as(member);

    await expect(
      saveDraft({ workflowId, graph: publishable, layout }),
    ).resolves.toEqual({
      ok: false,
      refusal: 'Changing a workflow needs workflows.manage',
    });
    expect(await draftOf(workflowId)).toEqual(before);
  });
});

describe('publishDraft', () => {
  it('freezes the draft as published by the caller and schedules its schedule triggers, paused while disabled', async () => {
    const workflowId = await newWorkflow();
    await saveDraft({ workflowId, graph: publishable, layout });

    await expect(publishDraft({ workflowId })).resolves.toEqual({
      ok: true,
      value: undefined,
    });

    const versions = await versionsOf(workflowId);
    expect(versions).toEqual([
      expect.objectContaining({
        graph: publishable,
        layout,
        published_by: owner.userId,
      }),
    ]);
    expect(versions[0]!.published_at).not.toBeNull();
    const { data: triggers } = await admin
      .from('workflow_trigger')
      .select('version_id, node_id, kind, temporal_schedule_id')
      .eq('workflow_id', workflowId)
      .throwOnError();
    expect(triggers).toEqual([
      {
        version_id: versions[0]!.id,
        node_id: 'daily',
        kind: 'schedule',
        temporal_schedule_id: expect.any(String),
      },
    ]);
    expect(
      world.schedules.get(triggers[0]!.temporal_schedule_id!)?.state?.paused,
    ).toBe(true);
    const { data: workflow } = await admin
      .from('workflow')
      .select('enabled')
      .eq('id', workflowId)
      .single()
      .throwOnError();
    expect(workflow.enabled).toBe(false);
  });

  it('refuses an invalid draft with its errors grouped per step, publishing nothing', async () => {
    const workflowId = await newWorkflow();
    await saveDraft({
      workflowId,
      graph: {
        nodes: [
          {
            id: 'tell',
            type: 'notify_team',
            label: 'Tell the team',
            config: { message: '' },
          },
          {
            id: 'later',
            type: 'wait',
            config: { kind: 'duration', amount: 1, unit: 'hours' },
          },
        ],
        edges: [{ id: 'e1', sourceNodeId: 'later', targetNodeId: 'tell' }],
      },
      layout,
    });

    await expect(publishDraft({ workflowId })).resolves.toEqual({
      ok: false,
      refusal: [
        'Workflow: Add a trigger to start this workflow',
        'Tell the team: This step is not connected to a trigger; The message setting is not valid',
        'Wait: This step is not connected to a trigger',
      ].join('\n'),
    });
    expect(
      (await versionsOf(workflowId)).map((version) => version.published_at),
    ).toEqual([null]);
    expect(world.schedules.size).toBe(0);
  });

  it('keeps the publish when schedules fail to sync and asks to try again', async () => {
    const workflowId = await newWorkflow();
    await saveDraft({ workflowId, graph: publishable, layout });
    world.schedulerDown = true;

    await expect(publishDraft({ workflowId })).resolves.toEqual({
      ok: false,
      refusal:
        "Published, but schedules couldn't be updated. Use Retry schedules to try again.",
    });
    expect((await versionsOf(workflowId))[0]!.published_at).not.toBeNull();
    expect(await syncFailedAt(workflowId)).not.toBeNull();
  });

  it('publishes nothing when the draft is saved again while publishing', async () => {
    const workflowId = await newWorkflow();
    await saveDraft({ workflowId, graph: publishable, layout });
    const changed: WorkflowGraph = {
      nodes: [{ id: 'tell', type: 'notify_team', config: {} }],
      edges: [],
    };
    world.whilePublishing = () =>
      saveDraft({ workflowId, graph: changed, layout });

    await expect(publishDraft({ workflowId })).resolves.toEqual({
      ok: false,
      refusal: 'The draft changed while publishing. Publish again.',
    });
    expect(await versionsOf(workflowId)).toEqual([
      expect.objectContaining({ graph: changed, published_at: null }),
    ]);
    expect(world.schedules.size).toBe(0);
  });

  it('refuses when there is no draft to publish', async () => {
    const workflowId = await newWorkflow();
    await saveDraft({ workflowId, graph: publishable, layout });
    await publishDraft({ workflowId });

    await expect(publishDraft({ workflowId })).resolves.toEqual({
      ok: false,
      refusal: 'Nothing new to publish',
    });
    expect(await versionsOf(workflowId)).toHaveLength(1);
  });

  it('refuses to publish an archived workflow', async () => {
    const workflowId = await newWorkflow();
    await saveDraft({ workflowId, graph: publishable, layout });
    await archive(workflowId);

    await expect(publishDraft({ workflowId })).resolves.toEqual({
      ok: false,
      refusal: 'Unarchive this workflow first',
    });
    expect(await draftOf(workflowId)).toBeDefined();
  });

  it('refuses an AI step until the team connects an AI provider', async () => {
    const workflowId = await newWorkflow();
    await saveDraft({
      workflowId,
      graph: {
        nodes: [
          { id: 'start', type: 'manual_trigger', config: {} },
          {
            id: 'ask',
            type: 'ask_ai',
            config: { prompt: 'Summarise the week' },
          },
        ],
        edges: [{ id: 'e1', sourceNodeId: 'start', targetNodeId: 'ask' }],
      },
      layout,
    });

    await expect(publishDraft({ workflowId })).resolves.toEqual({
      ok: false,
      refusal: 'Connect an AI provider first',
    });
    expect(await draftOf(workflowId)).toBeDefined();
  });

  it('leaves a run in flight on the version it started on', async () => {
    const workflowId = await newWorkflow();
    await saveDraft({ workflowId, graph: publishable, layout });
    await publishDraft({ workflowId });
    const [first] = await versionsOf(workflowId);
    const { data: run } = await admin
      .from('workflow_run')
      .insert({
        account_id: teamId,
        workflow_id: workflowId,
        version_id: first!.id,
        trigger_kind: 'manual',
        trigger_ref: crypto.randomUUID(),
        trigger_node_id: 'start',
        status: 'waiting',
      })
      .select('id')
      .single()
      .throwOnError();

    await saveDraft({ workflowId, graph: publishable, layout });
    await publishDraft({ workflowId });

    const { data: after } = await admin
      .from('workflow_run')
      .select('version_id, status')
      .eq('id', run.id)
      .single()
      .throwOnError();
    expect(after).toEqual({ version_id: first!.id, status: 'waiting' });
  });

  it('refuses a member and publishes nothing', async () => {
    const workflowId = await newWorkflow();
    await saveDraft({ workflowId, graph: publishable, layout });
    as(member);

    await expect(publishDraft({ workflowId })).resolves.toEqual({
      ok: false,
      refusal: 'Changing a workflow needs workflows.manage',
    });
    expect((await versionsOf(workflowId))[0]!.published_at).toBeNull();
  });
});

describe('a locked team', () => {
  it('refuses to publish or retry schedules, publishing nothing', async () => {
    const workflowId = await newWorkflow();
    await saveDraft({ workflowId, graph: publishable, layout });
    const readOnly = {
      ok: false,
      refusal: 'This team is read-only until billing is updated.',
    };

    await withLockedTeam(teamId, async () => {
      await expect(publishDraft({ workflowId })).resolves.toEqual(readOnly);
      await expect(retryScheduleSync({ workflowId })).resolves.toEqual(
        readOnly,
      );
    });
    expect(await draftOf(workflowId)).toBeDefined();
    expect(world.schedules.size).toBe(0);
  });
});

describe('retryScheduleSync', () => {
  it('schedules a published workflow once the scheduler is back', async () => {
    const workflowId = await newWorkflow();
    await saveDraft({ workflowId, graph: publishable, layout });
    world.schedulerDown = true;
    await publishDraft({ workflowId });
    world.schedulerDown = false;

    await expect(retryScheduleSync({ workflowId })).resolves.toEqual({
      ok: true,
      value: undefined,
    });
    const [daily] = await triggersOf(workflowId);
    expect(world.schedules.has(daily!.temporal_schedule_id!)).toBe(true);
    expect(await syncFailedAt(workflowId)).toBeNull();
  });

  it('asks to try again while the scheduler is still down', async () => {
    const workflowId = await newWorkflow();
    await saveDraft({ workflowId, graph: publishable, layout });
    world.schedulerDown = true;
    await publishDraft({ workflowId });

    await expect(retryScheduleSync({ workflowId })).resolves.toEqual({
      ok: false,
      refusal: "Schedules couldn't be updated; try again",
    });
    expect(await syncFailedAt(workflowId)).not.toBeNull();
  });

  it.each([
    [
      'enabling',
      (workflowId: string) => setWorkflowEnabled({ workflowId, enabled: true }),
    ],
    [
      'archiving',
      (workflowId: string) =>
        setWorkflowArchived({ workflowId, archived: true }),
    ],
  ])(
    'remembers schedules that failed to update when %s',
    async (_change, change) => {
      const workflowId = await newWorkflow();
      await saveDraft({ workflowId, graph: publishable, layout });
      await publishDraft({ workflowId });
      world.schedulerDown = true;

      await expect(change(workflowId)).resolves.toEqual({
        ok: false,
        refusal: "Saved, but schedules couldn't be updated; try again",
      });
      expect(await syncFailedAt(workflowId)).not.toBeNull();
    },
  );

  it.each([
    ['publishing', false, (workflowId: string) => publishDraft({ workflowId })],
    [
      'enabling',
      true,
      (workflowId: string) => setWorkflowEnabled({ workflowId, enabled: true }),
    ],
    [
      'archiving',
      true,
      (workflowId: string) =>
        setWorkflowArchived({ workflowId, archived: true }),
    ],
  ])(
    'forgets an earlier failed update once %s reaches the schedules',
    async (_change, alreadyPublished, change) => {
      const workflowId = await newWorkflow();
      await saveDraft({ workflowId, graph: publishable, layout });
      if (alreadyPublished) {
        await publishDraft({ workflowId });
      }
      await admin
        .from('workflow')
        .update({ schedules_sync_failed_at: '2026-10-30T09:00:00Z' })
        .eq('id', workflowId)
        .throwOnError();

      await expect(change(workflowId)).resolves.toMatchObject({ ok: true });
      expect(await syncFailedAt(workflowId)).toBeNull();
    },
  );

  it('refuses a member and schedules nothing', async () => {
    const workflowId = await newWorkflow();
    await saveDraft({ workflowId, graph: publishable, layout });
    world.schedulerDown = true;
    await publishDraft({ workflowId });
    world.schedulerDown = false;
    as(member);

    await expect(retryScheduleSync({ workflowId })).resolves.toEqual({
      ok: false,
      refusal: 'Changing a workflow needs workflows.manage',
    });
    expect(world.schedules.size).toBe(0);
  });
});

describe('renameWorkflow', () => {
  it('renames a workflow for a workflows manager', async () => {
    const workflowId = await newWorkflow('Old name');

    await expect(
      renameWorkflow({ workflowId, name: 'New name' }),
    ).resolves.toEqual({ ok: true, value: undefined });
    const { data } = await admin
      .from('workflow')
      .select('name')
      .eq('id', workflowId)
      .single()
      .throwOnError();
    expect(data.name).toBe('New name');
  });

  it('refuses a member and keeps the name', async () => {
    const workflowId = await newWorkflow('Kept name');
    as(member);

    await expect(
      renameWorkflow({ workflowId, name: 'Taken over' }),
    ).resolves.toEqual({
      ok: false,
      refusal: 'Changing a workflow needs workflows.manage',
    });
    const { data } = await admin
      .from('workflow')
      .select('name')
      .eq('id', workflowId)
      .single()
      .throwOnError();
    expect(data.name).toBe('Kept name');
  });
});
