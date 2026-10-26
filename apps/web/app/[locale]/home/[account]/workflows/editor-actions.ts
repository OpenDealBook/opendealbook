'use server';

import { z } from 'zod';

import { refusableAction } from '@odb/next/actions/refusable-action';
import { Refusal } from '@odb/next/refusal';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import {
  aiProviderProblem,
  parseWorkflowGraph,
  workflowGraphSchema,
  type RunnableGraph,
} from '@odb/workflows/builder/client';
import { labeledPublishProblems } from '@odb/workflows/builder/editor';

import {
  manageWorkflow,
  refuseIfArchived,
  refuseIfTeamLocked,
  requireWorkflowsManager,
  syncSchedulesOrRefuse,
} from './require-workflows-manager';
import { SCHEDULES_NOT_SYNCED } from './workflow-refusals';

const BLANK_GRAPH = {
  nodes: [
    { id: 'run-now', type: 'manual_trigger', config: {}, label: 'Run now' },
  ],
  edges: [],
};

const layoutSchema = z.object({
  direction: z.enum(['DOWN', 'RIGHT']),
  positions: z.record(z.string(), z.object({ x: z.number(), y: z.number() })),
});

const workflowRef = { workflowId: z.uuid() };

async function manageLiveWorkflow(workflowId: string, userId: string) {
  const managed = await manageWorkflow(workflowId, userId);
  refuseIfArchived(managed.archived);

  return managed;
}

function publishRefusal(graph: RunnableGraph): string {
  const steps = new Map<string | null, { name: string; messages: string[] }>();

  for (const { nodeId, label, message } of labeledPublishProblems(graph)) {
    const step = steps.get(nodeId) ?? {
      name: label ?? 'Workflow',
      messages: [],
    };
    step.messages.push(message);
    steps.set(nodeId, step);
  }

  return [...steps.values()]
    .map(({ name, messages }) => `${name}: ${messages.join('; ')}`)
    .join('\n');
}

export const createWorkflow = refusableAction(
  async ({ accountId, name }, user) => {
    const client = await requireWorkflowsManager(accountId, user.id);
    const { data: workflowId } = await client
      .rpc('create_workflow', {
        p_account_id: accountId,
        p_name: name,
        p_graph: BLANK_GRAPH,
      })
      .throwOnError();

    return { workflowId };
  },
  z.object({ accountId: z.uuid(), name: z.string().trim().min(1) }),
);

export const saveDraft = refusableAction(
  async ({ workflowId, graph, layout }, user) => {
    const { client } = await manageLiveWorkflow(workflowId, user.id);
    const { data: savedAt } = await client
      .rpc('save_workflow_draft', {
        p_workflow_id: workflowId,
        p_graph: graph,
        p_layout: layout,
      })
      .throwOnError();

    return { savedAt };
  },
  z.object({
    ...workflowRef,
    graph: workflowGraphSchema,
    layout: layoutSchema,
  }),
);

export const publishDraft = refusableAction(async ({ workflowId }, user) => {
  const { client, accountId } = await manageLiveWorkflow(workflowId, user.id);
  await refuseIfTeamLocked(accountId);
  const { data: draft } = await client
    .from('workflow_version')
    .select('id, schema_version, graph, saved_at')
    .eq('workflow_id', workflowId)
    .is('published_at', null)
    .maybeSingle()
    .throwOnError();

  if (!draft) {
    throw new Refusal('Nothing new to publish');
  }

  const graph = parseWorkflowGraph({
    schemaVersion: draft.schema_version,
    graph: draft.graph,
  });
  const problems = publishRefusal(graph);

  if (problems) {
    throw new Refusal(problems);
  }

  const aiProblem = await aiProviderProblem(accountId, graph);

  if (aiProblem) {
    throw new Refusal(aiProblem);
  }

  const { data: published } = await getSupabaseServerAdminClient()
    .from('workflow_version')
    .update({ published_at: new Date().toISOString(), published_by: user.id })
    .eq('id', draft.id)
    .eq('saved_at', draft.saved_at)
    .is('published_at', null)
    .select('id')
    .throwOnError();

  if (published.length === 0) {
    throw new Refusal('The draft changed while publishing. Publish again.');
  }

  await syncSchedulesOrRefuse(accountId, workflowId, SCHEDULES_NOT_SYNCED);
}, z.object(workflowRef));

export const retryScheduleSync = refusableAction(
  async ({ workflowId }, user) => {
    const { accountId } = await manageWorkflow(workflowId, user.id);
    await refuseIfTeamLocked(accountId);

    await syncSchedulesOrRefuse(
      accountId,
      workflowId,
      "Schedules couldn't be updated; try again",
    );
  },
  z.object(workflowRef),
);

export const renameWorkflow = refusableAction(
  async ({ workflowId, name }, user) => {
    const { client } = await manageWorkflow(workflowId, user.id);

    await client
      .from('workflow')
      .update({ name })
      .eq('id', workflowId)
      .throwOnError();
  },
  z.object({ ...workflowRef, name: z.string().trim().min(1) }),
);
