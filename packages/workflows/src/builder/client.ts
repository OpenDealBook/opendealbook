import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { getTemporalClient, TASK_QUEUE } from '../client';
import { parseWorkflowGraph } from './graph';
import { TEAM_UNLOCKED_SIGNAL, workflowRunWorkflowId } from './ids';
import type { RunPublishedWorkflowInput } from './workflow';

const REFUSALS = {
  not_permitted: 'Running a workflow needs workflows.manage',
  archived: 'This workflow is archived',
  not_published: 'Publish this workflow first',
  no_manual_trigger: 'Add a manual trigger to run this workflow',
};

export class ManualRunRefused extends Error {
  constructor(readonly reason: keyof typeof REFUSALS) {
    super(REFUSALS[reason]);
  }
}

export async function startManualWorkflowRun(input: {
  client: SupabaseClient<Database>;
  workflowId: string;
  requestId: string;
}): Promise<{ runId: string }> {
  const {
    data: { user },
  } = await input.client.auth.getUser();
  const { data: workflow } = await input.client
    .from('workflow')
    .select('account_id, archived_at')
    .eq('id', input.workflowId)
    .single()
    .throwOnError();
  const { data: canManage } = await input.client
    .rpc('has_permission', {
      user_id: user!.id,
      account_id: workflow.account_id,
      permission_name: 'workflows.manage',
    })
    .throwOnError();

  if (!canManage) {
    throw new ManualRunRefused('not_permitted');
  }
  if (workflow.archived_at !== null) {
    throw new ManualRunRefused('archived');
  }

  const admin = getSupabaseServerAdminClient();
  const { data: version } = await admin
    .from('workflow_version')
    .select('id, schema_version, graph')
    .eq('workflow_id', input.workflowId)
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle()
    .throwOnError();

  if (!version) {
    throw new ManualRunRefused('not_published');
  }

  const manualTrigger = parseWorkflowGraph({
    schemaVersion: version.schema_version,
    graph: version.graph,
  }).triggers.find((trigger) => trigger.type === 'manual_trigger');

  if (!manualTrigger) {
    throw new ManualRunRefused('no_manual_trigger');
  }

  await admin
    .from('workflow_run')
    .upsert(
      {
        account_id: workflow.account_id,
        workflow_id: input.workflowId,
        version_id: version.id,
        trigger_kind: 'manual',
        trigger_ref: input.requestId,
        trigger_node_id: manualTrigger.id,
      },
      { onConflict: 'workflow_id,trigger_ref', ignoreDuplicates: true },
    )
    .throwOnError();
  const { data: run } = await admin
    .from('workflow_run')
    .select('id')
    .eq('workflow_id', input.workflowId)
    .eq('trigger_ref', input.requestId)
    .single()
    .throwOnError();

  const temporal = await getTemporalClient();
  await temporal.workflow.start('runPublishedWorkflow', {
    taskQueue: TASK_QUEUE,
    workflowId: workflowRunWorkflowId(run.id),
    workflowIdConflictPolicy: 'USE_EXISTING',
    args: [
{ runId: run.id } satisfies RunPublishedWorkflowInput
    ],
  });

  return { runId: run.id };
}

export async function resumeLockedWorkflowRuns(input: {
  accountId: string;
}): Promise<void> {
  const { data: runs } = await getSupabaseServerAdminClient()
    .from('workflow_run')
    .select('id')
    .eq('account_id', input.accountId)
    .eq('status', 'paused_locked')
    .throwOnError();
  const temporal = await getTemporalClient();

  for (const run of runs) {
    await temporal.workflow
      .getHandle(workflowRunWorkflowId(run.id))
      .signal(TEAM_UNLOCKED_SIGNAL);
  }
}
