import { expect } from '@playwright/test';

import { insert, rows } from './db';

type Graph = {
  nodes: { id: string; type: string; label?: string; config: Record<string, unknown> }[];
  edges: { id: string; sourceNodeId: string; targetNodeId: string }[];
};

const trigger = { id: 'start', type: 'manual_trigger', config: {} };

export function notifyGraph(message: string, label?: string): Graph {
  return {
    nodes: [trigger, { id: 'notify', type: 'notify_team', ...(label ? { label } : {}), config: { message } }],
    edges: [{ id: 'start-notify', sourceNodeId: 'start', targetNodeId: 'notify' }],
  };
}

export const FAILING_MESSAGE = '{{steps.nope.x}}';

export async function teamIdOf(teamSlug: string): Promise<string> {
  const [team] = await rows<{ id: string }>('accounts', `slug=eq.${teamSlug}&select=id`);
  return team!.id;
}

export async function seedWorkflow({
  accountId,
  name,
  publishedBy,
  graph,
}: {
  accountId: string;
  name: string;
  publishedBy?: string;
  graph?: Graph;
}): Promise<string> {
  const [workflow] = await insert<{ id: string }>('workflow', {
    account_id: accountId,
    name,
  });

  if (publishedBy) {
    await insert('workflow_version', {
      account_id: accountId,
      workflow_id: workflow!.id,
      schema_version: 1,
      graph: graph ?? notifyGraph(`Pipeline review ${name}`),
      published_at: new Date().toISOString(),
      published_by: publishedBy,
    });
  }

  return workflow!.id;
}

export async function waitForRun(
  workflowId: string,
  status: string,
): Promise<string> {
  let runId = '';
  await expect
    .poll(
      async () => {
        const [run] = await rows<{ id: string; status: string }>(
          'workflow_run',
          `workflow_id=eq.${workflowId}&status=eq.${status}&select=id,status&order=started_at.desc&limit=1`,
        );
        runId = run?.id ?? '';
        return runId;
      },
      { timeout: 60 * 1000, message: `a ${status} run of the workflow` },
    )
    .not.toBe('');
  return runId;
}
