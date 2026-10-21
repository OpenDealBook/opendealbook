import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  provisionAccount,
  type IntegrationAccount,
} from '../../test-support/integration-harness';
import { notifyApprovalWaiting } from '../builder/approvalNotice';
import { remindWaitingApprovals } from './approvalReminderActivity';

let owner: IntegrationAccount;
let manager: IntegrationAccount;
let member: IntegrationAccount;
let teamId: string;
let slug: string;
let workflowId: string;
let runId: string;
let versionId: string;

const graph = {
  nodes: [
    { id: 'start', type: 'manual_trigger', config: {} },
    { id: 'ask', type: 'approval', config: { prompt: 'Send the LOI?' } },
    { id: 'vet', type: 'decision_model', config: { firmId: 'firm-1' } },
    {
      id: 'pause',
      type: 'wait',
      config: { kind: 'duration', amount: 1, unit: 'days' },
    },
  ],
  edges: [],
};

beforeAll(async () => {
  [owner, manager, member] = await Promise.all([
    provisionAccount(),
    provisionAccount(),
    provisionAccount(),
  ]);
  teamId = owner.accountId;
  await owner.admin
    .from('accounts_memberships')
    .insert([
      { account_id: teamId, user_id: manager.userId, account_role: 'admin' },
      { account_id: teamId, user_id: member.userId, account_role: 'member' },
    ])
    .throwOnError();
  await owner.admin
    .from('accounts_memberships')
    .update({ account_role: 'member' })
    .eq('account_id', teamId)
    .eq('user_id', owner.userId)
    .throwOnError();
  const { data: team } = await owner.admin
    .from('accounts')
    .update({ timezone: 'America/Chicago' })
    .eq('id', teamId)
    .select('slug')
    .single()
    .throwOnError();
  slug = team.slug;
  const { data: workflow } = await owner.admin
    .from('workflow')
    .insert({ account_id: teamId, name: 'Vet new firms' })
    .select('id')
    .single()
    .throwOnError();
  workflowId = workflow.id;
  const { data: version } = await owner.admin
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
  versionId = version.id;
  runId = await startRun();
});

async function startRun() {
  const { data: run } = await owner.admin
    .from('workflow_run')
    .insert({
      account_id: teamId,
      workflow_id: workflowId,
      version_id: versionId,
      trigger_kind: 'manual',
      trigger_ref: crypto.randomUUID(),
      trigger_node_id: 'start',
    })
    .select('id')
    .single()
    .throwOnError();
  return run.id;
}

afterEach(async () => {
  vi.useRealTimers();
  await owner.admin
    .from('workflow_step_run')
    .delete()
    .eq('run_id', runId)
    .throwOnError();
  await owner.admin
    .from('notifications')
    .delete()
    .like('dedupe_key', 'workflow_approval_%')
    .eq('account_id', teamId)
    .throwOnError();
});

afterAll(async () => {
  await owner.admin.from('workflow_run').delete().eq('workflow_id', workflowId);
  await owner.admin
    .from('workflow_version')
    .delete()
    .eq('workflow_id', workflowId);
  await owner.admin.from('workflow').delete().eq('id', workflowId);
  await owner.admin.from('accounts').delete().eq('id', teamId);
  await Promise.all(
    [owner, manager, member].map((account) => account.cleanup()),
  );
});

async function stepAt(
  nodeId: string,
  status: 'waiting' | 'succeeded',
  startedAt = '2026-10-20T00:00:00Z',
  onRun = runId,
) {
  const { data: step } = await owner.admin
    .from('workflow_step_run')
    .insert({
      account_id: teamId,
      run_id: onRun,
      node_id: nodeId,
      status,
      started_at: startedAt,
      waiting_on:
        status === 'succeeded'
          ? null
          : nodeId === 'pause'
            ? 'timer'
            : 'decision',
      idempotency_key: `${onRun}:${nodeId}:0`,
      wake_at:
        nodeId === 'pause'
          ? new Date(Date.now() + 86_400_000).toISOString()
          : null,
      finished_at: status === 'succeeded' ? new Date().toISOString() : null,
    })
    .select('id')
    .single()
    .throwOnError();
  return step.id;
}

async function noticesFor(kind: 'reminder' | 'waiting', stepRunId: string) {
  const { data } = await owner.admin
    .from('notifications')
    .select('recipient_user_id, body, link')
    .eq('account_id', teamId)
    .like('dedupe_key', `workflow_approval_${kind}:${stepRunId}:%`)
    .throwOnError();
  return data;
}

function remindersFor(stepRunId: string) {
  return noticesFor('reminder', stepRunId);
}

function at(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
}

describe('daily approval reminder (integration)', () => {
  it('reminds each deal manager of a waiting approval at 09:00 team time, once that day', async () => {
    const ask = await stepAt('ask', 'waiting');

    at('2026-10-21T14:00:00Z');
    await remindWaitingApprovals();
    await remindWaitingApprovals();

    expect(await remindersFor(ask)).toEqual([
      {
        recipient_user_id: manager.userId,
        body: 'Vet new firms is waiting for approval',
        link: `/home/${slug}/approvals`,
      },
    ]);
  });

  it('reminds again the next team day until it is decided', async () => {
    const ask = await stepAt('ask', 'waiting');

    at('2026-10-21T14:05:00Z');
    await remindWaitingApprovals();
    at('2026-10-22T14:05:00Z');
    await remindWaitingApprovals();

    expect(await remindersFor(ask)).toHaveLength(2);
  });

  it('reminds of a verdict waiting for a deal manager', async () => {
    const vet = await stepAt('vet', 'waiting');

    at('2026-10-21T14:00:00Z');
    await remindWaitingApprovals();

    expect(await remindersFor(vet)).toHaveLength(1);
  });

  it('sends nothing outside 09:00 team time', async () => {
    const ask = await stepAt('ask', 'waiting');

    at('2026-10-21T09:00:00Z');
    await remindWaitingApprovals();

    expect(await remindersFor(ask)).toEqual([]);
  });

  it('sends nothing for a decided approval or a timed wait', async () => {
    const decided = await stepAt('ask', 'succeeded');
    const pause = await stepAt('pause', 'waiting');

    at('2026-10-21T14:00:00Z');
    await remindWaitingApprovals();

    expect(await remindersFor(decided)).toEqual([]);
    expect(await remindersFor(pause)).toEqual([]);
  });

  it.each(['failed', 'succeeded'] as const)(
    'sends nothing for a waiting step whose run has %s',
    async (status) => {
      const finishedRunId = await startRun();
      const ask = await stepAt('ask', 'waiting', undefined, finishedRunId);
      await owner.admin
        .from('workflow_run')
        .update({ status, finished_at: new Date().toISOString() })
        .eq('id', finishedRunId)
        .throwOnError();

      at('2026-10-21T14:00:00Z');
      await remindWaitingApprovals();

      expect(await remindersFor(ask)).toEqual([]);
    },
  );

  it('sends nothing once a deal manager decided, before the run picks it up', async () => {
    const parkedRunId = await startRun();
    const ask = await stepAt('ask', 'waiting', undefined, parkedRunId);
    await owner.admin
      .from('workflow_run')
      .update({ status: 'awaiting_approval' })
      .eq('id', parkedRunId)
      .throwOnError();
    await manager.user
      .from('workflow_approval')
      .insert({ step_run_id: ask, account_id: teamId, approved: true })
      .throwOnError();

    at('2026-10-21T14:00:00Z');
    await remindWaitingApprovals();

    expect(await remindersFor(ask)).toEqual([]);
  });

  it('sends nothing for a verdict step parked at the AI cap', async () => {
    const vet = await stepAt('vet', 'waiting');
    await owner.admin
      .from('workflow_step_run')
      .update({ waiting_on: 'cap' })
      .eq('id', vet)
      .throwOnError();

    at('2026-10-21T14:00:00Z');
    await remindWaitingApprovals();

    expect(await remindersFor(vet)).toEqual([]);
  });

  it('skips the reminder when the first notice went out within the hour', async () => {
    const ask = await stepAt('ask', 'waiting', '2026-10-21T13:30:00Z');

    at('2026-10-21T14:00:00Z');
    await remindWaitingApprovals();

    expect(await remindersFor(ask)).toEqual([]);
  });
});

describe('notice when an approval starts waiting (integration)', () => {
  it('tells each deal manager right away, once, whatever the hour', async () => {
    const ask = await stepAt('ask', 'waiting');

    at('2026-10-21T03:00:00Z');
    await notifyApprovalWaiting({ stepRunId: ask });
    await notifyApprovalWaiting({ stepRunId: ask });

    expect(await noticesFor('waiting', ask)).toEqual([
      {
        recipient_user_id: manager.userId,
        body: 'Vet new firms is waiting for approval',
        link: `/home/${slug}/approvals`,
      },
    ]);
  });
});
