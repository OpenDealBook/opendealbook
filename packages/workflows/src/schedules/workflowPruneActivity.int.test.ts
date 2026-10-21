import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  provisionAccount,
  type IntegrationAccount,
} from '../../test-support/integration-harness';
import { pruneWorkflowStepData } from './workflowPruneActivity';

const DAY = 24 * 60 * 60 * 1000;

let owner: IntegrationAccount;
let runId: string;

function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY).toISOString();
}

async function seedStep(nodeId: string, ageDays: number): Promise<string> {
  const at = daysAgo(ageDays);
  const { data: step } = await owner.admin
    .from('workflow_step_run')
    .insert({
      account_id: owner.accountId,
      run_id: runId,
      node_id: nodeId,
      status: 'succeeded',
      input: { lender: 'Harbor Bank' },
      output: { sent: true },
      idempotency_key: crypto.randomUUID(),
      started_at: at,
      finished_at: at,
    })
    .select('id')
    .single()
    .throwOnError();
  await owner.admin
    .from('workflow_step_log')
    .insert({
      account_id: owner.accountId,
      step_run_id: step.id,
      level: 'info',
      message: 'Sent the nudge',
      created_at: at,
    })
    .throwOnError();
  return step.id;
}

async function stepData(stepId: string) {
  const { data } = await owner.admin
    .from('workflow_step_run')
    .select('input, output, workflow_step_log(message)')
    .eq('id', stepId)
    .single()
    .throwOnError();
  return data;
}

beforeAll(async () => {
  owner = await provisionAccount();
  const { data: workflow } = await owner.admin
    .from('workflow')
    .insert({ account_id: owner.accountId, name: 'Lender nudge' })
    .select('id')
    .single()
    .throwOnError();
  const { data: version } = await owner.admin
    .from('workflow_version')
    .insert({
      account_id: owner.accountId,
      workflow_id: workflow.id,
      schema_version: 1,
      graph: { nodes: [], edges: [] },
      published_at: daysAgo(100),
      published_by: owner.userId,
    })
    .select('id')
    .single()
    .throwOnError();
  const { data: run } = await owner.admin
    .from('workflow_run')
    .insert({
      account_id: owner.accountId,
      workflow_id: workflow.id,
      version_id: version.id,
      trigger_kind: 'manual',
      trigger_ref: crypto.randomUUID(),
      trigger_node_id: 'start',
      status: 'succeeded',
      started_at: daysAgo(91),
      finished_at: daysAgo(1),
    })
    .select('id')
    .single()
    .throwOnError();
  runId = run.id;
});

afterAll(async () => {
  await owner.admin.from('workflow_run').delete().eq('account_id', owner.accountId);
  await owner.admin.from('accounts').delete().eq('id', owner.accountId);
  await owner.cleanup();
});

describe('pruneWorkflowStepData', () => {
  it('clears the input, output and logs of a step finished over 90 days ago, keeps a recent step, and keeps the run', async () => {
    const oldStep = await seedStep('nudge-old', 91);
    const recentStep = await seedStep('nudge-recent', 1);

    await pruneWorkflowStepData();

    expect({
      old: await stepData(oldStep),
      recent: await stepData(recentStep),
    }).toEqual({
      old: { input: null, output: null, workflow_step_log: [] },
      recent: {
        input: { lender: 'Harbor Bank' },
        output: { sent: true },
        workflow_step_log: [{ message: 'Sent the nudge' }],
      },
    });
    const { data: run } = await owner.admin
      .from('workflow_run')
      .select('status')
      .eq('id', runId)
      .single()
      .throwOnError();
    expect(run).toEqual({ status: 'succeeded' });
  });
});
