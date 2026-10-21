import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  appendDealEvent,
  provisionAccount,
  seedDeal,
  type IntegrationAccount,
} from '../../test-support/integration-harness';

vi.mock('../client', () => ({
  TASK_QUEUE: 'opendealbook',
  getTemporalClient: async () => ({
    workflow: {
      start: async () => undefined,
      getHandle: () => ({ describe: async () => ({ startTime: new Date() }) }),
    },
  }),
}));

import {
  fetchTriggerEvents,
  loadEventRelayCursor,
  type RelayCursor,
  saveEventRelayCursor,
  startEventRelayCursorAtLatest,
  startWorkflowRunsForEvent,
  type LoggedEvent,
} from './eventRelayActivities';
import type { NodeConfig, WorkflowGraph } from './graph';

let owner: IntegrationAccount;

beforeAll(async () => {
  owner = await provisionAccount();
});

afterAll(async () => {
  await owner.cleanup();
});

function graphOn(trigger: NodeConfig<'event_trigger'>): WorkflowGraph {
  return {
    nodes: [
      { id: 'when', type: 'event_trigger', config: trigger },
      { id: 'tell', type: 'notify_team', config: { message: 'Something happened' } },
    ],
    edges: [{ id: 'when-tell', sourceNodeId: 'when', targetNodeId: 'tell' }],
  };
}

async function newWorkflow(): Promise<string> {
  const { data } = await owner.admin
    .from('workflow')
    .insert({ account_id: owner.accountId, name: `Events ${crypto.randomUUID()}` })
    .select('id')
    .single()
    .throwOnError();
  return data.id;
}

async function publish(workflowId: string, graph: WorkflowGraph): Promise<string> {
  const { data } = await owner.admin
    .from('workflow_version')
    .insert({
      account_id: owner.accountId,
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

async function setEnabled(workflowId: string, enabled: boolean): Promise<void> {
  await owner.admin.from('workflow').update({ enabled }).eq('id', workflowId).throwOnError();
}

async function enabledWorkflowOn(
  trigger: NodeConfig<'event_trigger'>,
): Promise<{ workflowId: string; versionId: string }> {
  const workflowId = await newWorkflow();
  const versionId = await publish(workflowId, graphOn(trigger));
  await setEnabled(workflowId, true);
  return { workflowId, versionId };
}

async function horizon(): Promise<RelayCursor> {
  const { data } = await owner.admin.rpc('trigger_event_horizon').throwOnError();
  return { xid: data, seq: 0 };
}

async function settled(
  log: 'deal' | 'account',
  after: RelayCursor,
  count: number,
): Promise<LoggedEvent[]> {
  return vi.waitFor(async () => {
    const events = (await fetchTriggerEvents({ log, after, limit: 1000 })).filter(
      (event) => event.accountId === owner.accountId,
    );
    expect(events.length).toBeGreaterThanOrEqual(count);
    return events;
  });
}

async function dealCreated(description: string): Promise<LoggedEvent> {
  const before = await horizon();
  await seedDeal(owner.admin, owner.accountId, owner.userId, { description });
  const events = await settled('deal', before, 1);
  return events.find((event) => event.payload.description === description)!;
}

async function runsOf(workflowId: string) {
  const { data } = await owner.admin
    .from('workflow_run')
    .select('version_id, trigger_kind, trigger_ref, trigger_node_id')
    .eq('workflow_id', workflowId)
    .throwOnError();
  return data;
}

describe('starting workflow runs for an event', () => {
  it('starts one event run per matching trigger, however often the event is relayed', async () => {
    const { workflowId, versionId } = await enabledWorkflowOn({ eventType: 'deal.created' });
    const event = await dealCreated('Corner bakery');

    await startWorkflowRunsForEvent(event);
    await startWorkflowRunsForEvent(event);

    expect(await runsOf(workflowId)).toEqual([
      {
        version_id: versionId,
        trigger_kind: 'event',
        trigger_ref: `when@deal:${event.globalSeq}`,
        trigger_node_id: 'when',
      },
    ]);
  });

  it('starts a run only when the event payload passes the trigger filter', async () => {
    const { workflowId } = await enabledWorkflowOn({
      eventType: 'deal.created',
      filter: { '==': [{ var: 'description' }, 'Harbor HVAC'] },
    });
    const passing = await dealCreated('Harbor HVAC');
    const failing = await dealCreated('Harbor Plumbing');

    await startWorkflowRunsForEvent(passing);
    await startWorkflowRunsForEvent(failing);

    expect((await runsOf(workflowId)).map((run) => run.trigger_ref)).toEqual([
      `when@deal:${passing.globalSeq}`,
    ]);
  });

  it('treats a filter on a field the event lacks as no match, still starting other workflows', async () => {
    const lacking = await enabledWorkflowOn({
      eventType: 'deal.created',
      filter: { '>': [{ var: 'asking_price' }, 100] },
    });
    const plain = await enabledWorkflowOn({ eventType: 'deal.created' });
    const event = await dealCreated('Birch lane bookbinder');

    await startWorkflowRunsForEvent(event);

    expect(await runsOf(lacking.workflowId)).toEqual([]);
    expect(await runsOf(plain.workflowId)).toHaveLength(1);
  });

  it('starts the run of a team locked for billing, so it can pause like any run', async () => {
    const { workflowId } = await enabledWorkflowOn({ eventType: 'deal.created' });
    const event = await dealCreated('Quarry lane print shop');
    const { data: config } = await owner.admin
      .from('config')
      .select('enable_team_account_billing')
      .single()
      .throwOnError();
    await owner.admin.rpc('set_team_account_billing', { enabled: true }).throwOnError();
    await owner.admin
      .from('accounts')
      .update({ trial_ends_at: new Date(Date.now() - 86_400_000).toISOString() })
      .eq('id', owner.accountId)
      .throwOnError();

    try {
      await startWorkflowRunsForEvent(event);
    } finally {
      await owner.admin.from('accounts').update({ trial_ends_at: null }).eq('id', owner.accountId).throwOnError();
      await owner.admin
        .rpc('set_team_account_billing', { enabled: config.enable_team_account_billing })
        .throwOnError();
    }

    expect(await runsOf(workflowId)).toHaveLength(1);
  });

  it('passes over a workflow never published, still starting the others', async () => {
    await newWorkflow();
    const { workflowId } = await enabledWorkflowOn({ eventType: 'deal.created' });
    const event = await dealCreated('Orchard row cidery');

    await startWorkflowRunsForEvent(event);

    expect(await runsOf(workflowId)).toHaveLength(1);
  });

  it('starts nothing for a different event type or a disabled workflow', async () => {
    const otherType = await enabledWorkflowOn({ eventType: 'offer.accepted' });
    const disabled = await enabledWorkflowOn({ eventType: 'deal.created' });
    await setEnabled(disabled.workflowId, false);
    const event = await dealCreated('Valley dental');

    await startWorkflowRunsForEvent(event);

    expect(await runsOf(otherType.workflowId)).toEqual([]);
    expect(await runsOf(disabled.workflowId)).toEqual([]);
  });

  it('follows only the latest published version of a workflow', async () => {
    const { workflowId } = await enabledWorkflowOn({ eventType: 'deal.created' });
    await publish(workflowId, graphOn({ eventType: 'offer.accepted' }));
    const event = await dealCreated('Ridge roofing');

    await startWorkflowRunsForEvent(event);

    expect(await runsOf(workflowId)).toEqual([]);
  });

  it('starts nothing for an event that happened before the workflow was enabled', async () => {
    const workflowId = await newWorkflow();
    await publish(workflowId, graphOn({ eventType: 'deal.created' }));
    const event = await dealCreated('Lakeside laundromat');
    await setEnabled(workflowId, true);

    await startWorkflowRunsForEvent(event);

    expect(await runsOf(workflowId)).toEqual([]);
  });

  it('starts nothing for an event from before the workflow was switched off and on again', async () => {
    const { workflowId } = await enabledWorkflowOn({ eventType: 'deal.created' });
    await setEnabled(workflowId, false);
    const event = await dealCreated('Pine street florist');
    await setEnabled(workflowId, true);

    await startWorkflowRunsForEvent(event);

    expect(await runsOf(workflowId)).toEqual([]);
  });
});

describe('fetching trigger events', () => {
  it('returns the settled deal events a workflow can start on, in log order, after the position', async () => {
    const before = await horizon();
    const dealId = await seedDeal(owner.admin, owner.accountId, owner.userId, {
      description: 'Mill road garage',
    });
    await appendDealEvent(owner.admin, {
      dealId,
      aggregateType: 'deal',
      aggregateId: dealId,
      eventType: 'deal.updated',
      payload: { description: 'Mill road garage and tyres' },
    });
    await appendDealEvent(owner.admin, {
      dealId,
      aggregateType: 'deal_milestone',
      aggregateId: crypto.randomUUID(),
      eventType: 'deal_milestone.set',
      payload: { kind: 'loi_signed', target_on: null, actual_on: '2026-10-01' },
    });

    const ours = await settled('deal', before, 2);

    expect(ours.map((event) => event.eventType)).toEqual(['deal.created', 'deal.loi_signed']);
    expect(ours[1]).toMatchObject({
      log: 'deal',
      dealId,
      payload: { signed_on: '2026-10-01' },
    });
    expect(ours[0]!.globalSeq).toBeLessThan(ours[1]!.globalSeq);
  });

  it('returns a firm approval from the team event log', async () => {
    const before = await horizon();
    const { data: firm } = await owner.admin
      .from('firm')
      .insert({ account_id: owner.accountId, name: 'Harbor HVAC' })
      .select('id')
      .single()
      .throwOnError();
    const { data: verdict } = await owner.admin
      .from('firm_verdict')
      .insert({ account_id: owner.accountId, firm_id: firm.id, fit: true, reasons: ['In the box'], model: 'm' })
      .select('id')
      .single()
      .throwOnError();
    await owner.admin
      .from('firm_verdict_approval')
      .insert({ verdict_id: verdict.id, account_id: owner.accountId, approved_by: owner.userId })
      .throwOnError();

    expect(await settled('account', before, 1)).toEqual([
      {
        log: 'account',
        xid: expect.any(String),
        globalSeq: expect.any(Number),
        accountId: owner.accountId,
        eventType: 'firm.approved',
        payload: { firm_id: firm.id, verdict_id: verdict.id, approved_by: owner.userId },
      },
    ]);
  });
});

describe('recording an LOI signing', () => {
  it('records one signing when two people set the date at the same moment, and both saves land', async () => {
    const dealId = await seedDeal(owner.admin, owner.accountId, owner.userId, {
      description: 'Twin oaks dental',
    });
    const milestoneId = crypto.randomUUID();
    const setDate = (actualOn: string) =>
      appendDealEvent(owner.admin, {
        dealId,
        aggregateType: 'deal_milestone',
        aggregateId: milestoneId,
        eventType: 'deal_milestone.set',
        payload: { kind: 'loi_signed', target_on: null, actual_on: actualOn },
      });

    await Promise.all([setDate('2026-10-01'), setDate('2026-10-02')]);

    const { data } = await owner.admin
      .from('deal_event')
      .select('event_type')
      .eq('deal_id', dealId)
      .in('event_type', ['deal.loi_signed', 'deal_milestone.set'])
      .throwOnError();
    expect(data.map((event) => event.event_type).sort()).toEqual([
      'deal.loi_signed',
      'deal_milestone.set',
      'deal_milestone.set',
    ]);
  });
});

describe('starting the event relay at the latest event', () => {
  const fresh = `int-event-relay-${crypto.randomUUID()}`;
  const started = `int-event-relay-${crypto.randomUUID()}`;

  afterAll(async () => {
    await owner.admin.from('relay_cursor').delete().in('name', [fresh, started]);
  });

  it('saves and returns the settled horizon with no events relayed yet', async () => {
    const before = await horizon();

    const cursor = await startEventRelayCursorAtLatest({ name: fresh });

    expect(BigInt(cursor.xid)).toBeGreaterThanOrEqual(BigInt(before.xid));
    expect(cursor.seq).toBe(0);
    expect(await loadEventRelayCursor(fresh)).toEqual(cursor);
  });

  it('keeps a position already saved', async () => {
    await saveEventRelayCursor({ name: started, cursor: { xid: '5', seq: 7 } });

    expect(await startEventRelayCursorAtLatest({ name: started })).toEqual({ xid: '5', seq: 7 });
  });
});
