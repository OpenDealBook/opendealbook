import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  appendDealEvent,
  provisionAccount,
  seedDeal,
  type IntegrationAccount,
} from '../../test-support/integration-harness';

const temporal = vi.hoisted(() => ({ started: [] as string[] }));
const runInserts = vi.hoisted(() => ({ failWith: null as null | { code: string; message: string } }));
const steps = vi.hoisted(() => ({ configs: [] as [string, unknown][] }));
const SEARCH_RUN_ID = vi.hoisted(() => 'a7000000-0000-4000-8000-0000000000e1');

vi.mock('../client', () => ({
  TASK_QUEUE: 'opendealbook',
  getTemporalClient: async () => ({
    workflow: {
      start: async (_type: string, options: { args: [{ runId: string }] }) => {
        temporal.started.push(options.args[0].runId);
      },
      getHandle: () => ({ describe: async () => ({ startTime: new Date() }) }),
    },
  }),
}));

vi.mock('@odb/supabase/admin', async (importOriginal) => {
  const { getSupabaseServerAdminClient } = await importOriginal<typeof import('@odb/supabase/admin')>();
  return {
    getSupabaseServerAdminClient: () => {
      const admin = getSupabaseServerAdminClient();
      const from = admin.from.bind(admin);
      return Object.assign(admin, {
        from: (table: string) =>
          table === 'workflow_run' && runInserts.failWith
            ? { upsert: () => ({ select: () => ({ throwOnError: () => Promise.reject(runInserts.failWith) }) }) }
            : from(table as 'workflow_run'),
      });
    },
  };
});

vi.mock('@temporalio/activity', () => ({
  Context: { current: () => ({ cancellationSignal: new AbortController().signal, heartbeat: () => {} }) },
}));

vi.mock('./registry', async (importOriginal) => {
  const { stepRegistry } = await importOriginal<typeof import('./registry')>();
  const { defineStep } = await import('./step');
  const { z } = await import('zod');
  const recorded = (type: 'diligence_search' | 'diligence_report', output: Record<string, string>) =>
    defineStep({
      type,
      runOnce: false,
      configSchema: z.record(z.string(), z.json()),
      inputSchema: z.object({}),
      outputSchema: z.record(z.string(), z.string()),
      async run({ config }) {
        steps.configs.push([type, config]);
        return output;
      },
    });
  return {
    stepRegistry: {
      ...stepRegistry,
      diligence_search: recorded('diligence_search', { runId: SEARCH_RUN_ID }),
      diligence_report: recorded('diligence_report', { reportId: 'report-1' }),
    },
  };
});

vi.mock('@temporalio/workflow', async () => {
  const activities = await import('./activities');
  const { isTeamLocked } = await import('../teamLock');
  const { notifyApprovalWaiting } = await import('./approvalNotice');
  return {
    proxyActivities: () => ({ ...activities, isTeamLocked, notifyApprovalWaiting }),
    CancellationScope: { nonCancellable: <T>(fn: () => Promise<T>) => fn() },
    log: { warn: () => {} },
    isCancellation: () => false,
    defineSignal: (name: string) => name,
    setHandler: () => {},
    condition: async () => false,
    sleep: async () => {},
  };
});

import { validateForPublish } from './editor/publish';
import { fetchTriggerEvents, type LoggedEvent, startWorkflowRunsForEvent } from './eventRelayActivities';
import { startBackgroundSearchRun } from './client';
import { parseWorkflowGraph } from './graph';
import { runPublishedWorkflow } from './workflow';

const OTHER_DUPLICATE = { code: '23505', message: 'duplicate key value violates unique constraint "workflow_run_pkey"' };
const UNFINISHED = ['running', 'waiting', 'awaiting_approval', 'paused_cap', 'paused_locked'] as const;
const FINISHED = ['succeeded', 'failed', 'cancelled'] as const;

let owner: IntegrationAccount;
let member: SupabaseClient;
let dealLead: SupabaseClient;
const teammateIds: string[] = [];

async function backgroundSearch() {
  const { data } = await owner.admin
    .from('workflow')
    .select(
      'id, name, enabled, archived_at, enabled_after_deal_seq, workflow_version(id, schema_version, graph, layout, published_at)',
    )
    .eq('account_id', owner.accountId)
    .eq('system_key', 'background_search')
    .single()
    .throwOnError();
  return data;
}

async function newDeal(): Promise<string> {
  return seedDeal(owner.admin, owner.accountId, owner.userId, { description: 'Harbor bakery' });
}

async function signLoi(dealId: string): Promise<LoggedEvent> {
  const { data: horizon } = await owner.admin.rpc('trigger_event_horizon').throwOnError();
  await appendDealEvent(owner.admin, {
    dealId,
    aggregateType: 'deal_milestone',
    aggregateId: crypto.randomUUID(),
    eventType: 'deal_milestone.set',
    payload: { kind: 'loi_signed', target_on: null, actual_on: '2026-10-01' },
  });
  return vi.waitFor(async () => {
    const events = await fetchTriggerEvents({ log: 'deal', after: { xid: horizon, seq: 0 }, limit: 1000 });
    const event = events.find((each) => each.dealId === dealId && each.eventType === 'deal.loi_signed');
    expect(event).toBeDefined();
    return event!;
  });
}

async function run(runId: string) {
  const { data } = await owner.admin
    .from('workflow_run')
    .select('workflow_id, trigger_kind, trigger_node_id, trigger_output, status')
    .eq('id', runId)
    .single()
    .throwOnError();
  return data;
}

async function runsOfDeal(dealId: string) {
  const { data } = await owner.admin
    .from('workflow_run')
    .select('id')
    .eq('account_id', owner.accountId)
    .eq('trigger_output->>dealId', dealId)
    .throwOnError();
  return data;
}

async function setStatus(runId: string, status: (typeof UNFINISHED)[number] | (typeof FINISHED)[number]) {
  await owner.admin
    .from('workflow_run')
    .update({
      status,
      finished_at: (FINISHED as readonly string[]).includes(status) ? new Date().toISOString() : null,
    })
    .eq('id', runId)
    .throwOnError();
}

async function updateWorkflow(fields: { enabled?: boolean; archived_at?: string | null }) {
  await owner.admin
    .from('workflow')
    .update(fields)
    .eq('account_id', owner.accountId)
    .eq('system_key', 'background_search')
    .throwOnError();
}

function runAgain(client: SupabaseClient, dealId: string, requestId = crypto.randomUUID()) {
  return startBackgroundSearchRun({ client, dealId, requestId });
}

async function teammate(role: 'member' | 'deal_lead'): Promise<SupabaseClient> {
  const email = `int-wf-${role}-${crypto.randomUUID().slice(0, 8)}@odb.test`;
  const password = `Pw-${crypto.randomUUID().slice(0, 8)}-Aa1!`;
  const { data } = await owner.admin.auth.admin.createUser({ email, password, email_confirm: true });
  teammateIds.push(data.user!.id);
  await owner.admin
    .from('accounts_memberships')
    .insert({ account_id: owner.accountId, user_id: data.user!.id, account_role: role })
    .throwOnError();
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await client.auth.signInWithPassword({ email, password });
  return client;
}

beforeAll(async () => {
  owner = await provisionAccount();
  member = await teammate('member');
  dealLead = await teammate('deal_lead');
});

beforeEach(() => {
  runInserts.failWith = null;
  temporal.started = [];
  steps.configs = [];
});

afterAll(async () => {
  await owner.admin.from('workflow_run').delete().eq('account_id', owner.accountId);
  await owner.cleanup();
  for (const id of teammateIds) {
    await owner.admin.auth.admin.deleteUser(id);
  }
});

describe('the seeded Background search workflow', () => {
  it('is published and switched on for a new team', async () => {
    const workflow = await backgroundSearch();

    expect(workflow).toMatchObject({ name: 'Background search', enabled: true, archived_at: null });
    expect(workflow.workflow_version).toHaveLength(1);
    expect(workflow.workflow_version[0]!.published_at).not.toBeNull();
    expect(workflow.enabled_after_deal_seq).not.toBeNull();
  });

  it('passes the same validation a published workflow passes, with a canvas position for every step', async () => {
    const [version] = (await backgroundSearch()).workflow_version;
    const graph = parseWorkflowGraph({ schemaVersion: version!.schema_version, graph: version!.graph });

    expect(validateForPublish(graph)).toEqual({ byNode: {}, general: [] });
    expect(Object.keys((version!.layout as { positions: object }).positions).sort()).toEqual(
      graph.nodes.map((node) => node.id).sort(),
    );
  });

  it('searches a deal once its LOI is signed, then writes the report from that search', async () => {
    const dealId = await newDeal();

    await startWorkflowRunsForEvent({ ...(await signLoi(dealId)), accountId: owner.accountId });
    const [runId] = temporal.started;
    await runPublishedWorkflow({ runId: runId! });

    expect((await run(runId!)).status).toBe('succeeded');
    expect(steps.configs).toEqual([
      ['diligence_search', { dealId }],
      ['diligence_report', { runId: SEARCH_RUN_ID }],
    ]);
  });

  it('skips a signed LOI while a search for that deal is unfinished', async () => {
    const dealId = await newDeal();
    const { runId } = await runAgain(owner.user, dealId);
    temporal.started = [];

    await startWorkflowRunsForEvent({ ...(await signLoi(dealId)), accountId: owner.accountId });

    expect(await runsOfDeal(dealId)).toEqual([{ id: runId }]);
    expect(temporal.started).toEqual([]);
  });

  it('fails loudly on a duplicate that is not an unfinished search', async () => {
    const event = { ...(await signLoi(await newDeal())), accountId: owner.accountId };
    runInserts.failWith = OTHER_DUPLICATE;

    await expect(startWorkflowRunsForEvent(event)).rejects.toEqual(OTHER_DUPLICATE);
  });
});

describe('running the background search again', () => {
  it('starts a manual run of the team workflow from its trigger, carrying the deal and team', async () => {
    const dealId = await newDeal();
    const workflow = await backgroundSearch();
    const { runId } = await runAgain(owner.user, dealId);

    expect(await run(runId)).toMatchObject({
      workflow_id: workflow.id,
      trigger_kind: 'manual',
      trigger_node_id: 'loi-signed',
      trigger_output: { dealId, accountId: owner.accountId },
    });
    expect(temporal.started).toEqual([runId]);
  });

  it('runs the search and report for that deal', async () => {
    const dealId = await newDeal();
    const { runId } = await runAgain(owner.user, dealId);
    await runPublishedWorkflow({ runId });

    expect(steps.configs).toEqual([
      ['diligence_search', { dealId }],
      ['diligence_report', { runId: SEARCH_RUN_ID }],
    ]);
  });

  it('runs even when the team switched the workflow off', async () => {
    await updateWorkflow({ enabled: false });

    try {
      const { runId } = await runAgain(owner.user, await newDeal());
      expect(temporal.started).toEqual([runId]);
    } finally {
      await updateWorkflow({ enabled: true });
    }
  });

  it('runs on an archived workflow, whose signed LOIs start nothing', async () => {
    await updateWorkflow({ enabled: false, archived_at: new Date().toISOString() });

    try {
      const signedDeal = await newDeal();
      await startWorkflowRunsForEvent({ ...(await signLoi(signedDeal)), accountId: owner.accountId });
      expect(await runsOfDeal(signedDeal)).toEqual([]);

      const { runId } = await runAgain(owner.user, await newDeal());
      expect(temporal.started).toEqual([runId]);
    } finally {
      await updateWorkflow({ archived_at: null });
      await updateWorkflow({ enabled: true });
    }
  });

  it.each(UNFINISHED)('refuses while a run for the deal is %s, starting nothing', async (status) => {
    const dealId = await newDeal();
    const { runId } = await runAgain(owner.user, dealId);
    await setStatus(runId, status);
    temporal.started = [];

    await expect(runAgain(owner.user, dealId)).rejects.toMatchObject({ reason: 'search_running' });
    expect(temporal.started).toEqual([]);
  });

  it.each(FINISHED)('runs again once the last run %s', async (status) => {
    const dealId = await newDeal();
    const { runId: first } = await runAgain(owner.user, dealId);
    await setStatus(first, status);

    const { runId: second } = await runAgain(owner.user, dealId);
    expect(second).not.toBe(first);
  });

  it("is not held up by another deal's running search", async () => {
    await runAgain(owner.user, await newDeal());

    await expect(runAgain(owner.user, await newDeal())).resolves.toEqual({ runId: expect.any(String) });
  });

  it('returns the same run when the same request arrives twice', async () => {
    const dealId = await newDeal();
    const requestId = crypto.randomUUID();
    const first = await runAgain(owner.user, dealId, requestId);

    expect(await runAgain(owner.user, dealId, requestId)).toEqual(first);
  });

  it('lets a deal manager without workflows.manage run the workflow as seeded', async () => {
    await expect(runAgain(dealLead, await newDeal())).resolves.toEqual({ runId: expect.any(String) });
  });

  it('fails loudly on a duplicate that is not an unfinished search', async () => {
    runInserts.failWith = OTHER_DUPLICATE;

    await expect(runAgain(owner.user, await newDeal())).rejects.toEqual(OTHER_DUPLICATE);
  });

  it('refuses a member without deals.manage, starting nothing', async () => {
    const dealId = await newDeal();

    await expect(runAgain(member, dealId)).rejects.toMatchObject({ reason: 'search_not_permitted' });
    expect(temporal.started).toEqual([]);
  });

  it('starts from the first trigger of a graph whose LOI trigger the team replaced', async () => {
    const workflow = await backgroundSearch();
    const [seeded] = workflow.workflow_version;
    const graph = seeded!.graph as { nodes: { id: string }[]; edges: { sourceNodeId: string }[] };
    await owner.admin
      .from('workflow_version')
      .insert({
        account_id: owner.accountId,
        workflow_id: workflow.id,
        schema_version: seeded!.schema_version,
        graph: {
          nodes: [
            { id: 'weekly', type: 'schedule_trigger', config: { every: 'week', weekday: 'monday', at: '09:00' } },
            ...graph.nodes.slice(1),
          ],
          edges: graph.edges.map((edge) =>
            edge.sourceNodeId === 'loi-signed' ? { ...edge, sourceNodeId: 'weekly' } : edge,
          ),
        },
        published_at: new Date().toISOString(),
        published_by: owner.userId,
      })
      .throwOnError();
    const dealId = await newDeal();

    const { runId } = await runAgain(owner.user, dealId);

    expect(await run(runId)).toMatchObject({ trigger_node_id: 'weekly' });
  });

  it('needs workflows.manage once the team added a step of another kind', async () => {
    const workflow = await backgroundSearch();
    const [seeded] = workflow.workflow_version;
    const graph = seeded!.graph as { nodes: object[]; edges: object[] };
    await owner.admin
      .from('workflow_version')
      .insert({
        account_id: owner.accountId,
        workflow_id: workflow.id,
        schema_version: seeded!.schema_version,
        graph: {
          nodes: [...graph.nodes, { id: 'tell', type: 'notify_team', config: { message: 'Report ready' } }],
          edges: [...graph.edges, { id: 'report-tell', sourceNodeId: 'report', targetNodeId: 'tell' }],
        },
        published_at: new Date().toISOString(),
        published_by: owner.userId,
      })
      .throwOnError();

    await expect(runAgain(dealLead, await newDeal())).rejects.toMatchObject({ reason: 'search_changed' });
    expect(temporal.started).toEqual([]);
    await expect(runAgain(owner.user, await newDeal())).resolves.toEqual({ runId: expect.any(String) });
  });
});
