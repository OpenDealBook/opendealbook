import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';

import ApprovalsPage from './page';

const tables = vi.hoisted(() => ({}) as Record<string, unknown>);
const workspace = vi.hoisted(() => ({ permissions: [] as string[] }));

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  useRouter: () => ({ refresh() {} }),
}));

vi.mock('../layout', () => ({
  loadTeamWorkspace: async () => ({
    team: { id: '00000000-0000-4000-8000-0000000000a1' },
    permissions: workspace.permissions,
  }),
}));

vi.mock('./actions', () => ({
  decideApprovalAction: async () => {},
  decideVerdictAction: async () => {},
  revokeVerdictAction: async () => {},
  addFactAction: async () => {},
  editFactAction: async () => {},
  deleteFactAction: async () => {},
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    from: (table: string) => {
      const matches: [string, unknown][] = [];
      const query: object = new Proxy(
        {},
        {
          get: (_, method) =>
            method === 'throwOnError'
              ? async () => ({
                  data: (
                    (tables[table] ?? []) as Record<string, unknown>[]
                  ).filter((row) =>
                    matches.every(
                      ([column, value]) =>
                        !(column in row) || row[column] === value,
                    ),
                  ),
                })
              : method === 'eq'
                ? (column: string, value: unknown) => {
                    matches.push([column, value]);
                    return query;
                  }
                : () => query,
        },
      );
      return query;
    },
  }),
}));

process.env.TZ = 'UTC';

afterEach(() => {
  for (const table of Object.keys(tables)) {
    delete tables[table];
  }
  workspace.permissions = [];
});

const graph = {
  nodes: [
    { id: 'start', type: 'manual_trigger', config: {} },
    {
      id: 'ask',
      type: 'approval',
      config: { prompt: 'Send the LOI to {{firm}}?' },
    },
    { id: 'vet', type: 'decision_model', config: { firmId: 'f1' } },
    {
      id: 'pause',
      type: 'wait',
      config: { kind: 'duration', amount: 1, unit: 'days' },
    },
  ],
  edges: [],
};

const run = {
  workflow_id: 'w1',
  workflow: { name: 'Vet new firms' },
  workflow_version: { schema_version: 2, graph },
};

function waitingStep(id: string, nodeId: string, output: unknown) {
  return {
    id,
    run_id: 'r1',
    node_id: nodeId,
    output,
    started_at: '2026-10-20T14:00:00Z',
    waiting_on: 'decision',
    workflow_run: run,
    workflow_approval: [] as { approved: boolean }[],
  };
}

async function render() {
  return renderToStaticMarkup(
    await ApprovalsPage({ params: Promise.resolve({ account: 'acme' }) }),
  );
}

it('is not found for someone who cannot manage deals', async () => {
  await expect(render()).rejects.toThrow('NEXT_NOT_FOUND');
});

it("lists the team's waiting approvals with their resolved prompt and verdicts with their firm and reasons", async () => {
  workspace.permissions = ['deals.manage'];
  Object.assign(tables, {
    workflow_step_run: [
      waitingStep('s1', 'ask', { prompt: 'Send the LOI to Acme Plumbing?' }),
      waitingStep('s2', 'vet', { verdictId: 'v1' }),
      { ...waitingStep('s3', 'pause', null), waiting_on: 'timer' },
    ],
    firm_verdict: [
      {
        id: 'v1',
        fit: false,
        reasons: ['Revenue below the deal box'],
        firm: { name: 'Bolt Roofing' },
      },
    ],
  });

  const html = await render();

  expect(html).toContain('Send the LOI to Acme Plumbing?');
  expect(html).toContain('Bolt Roofing');
  expect(html).toContain('Revenue below the deal box');
  expect(html).toContain('Override and approve');
  expect(
    html.match(/href="\/home\/acme\/workflows\/w1\/runs\/r1"/g),
  ).toHaveLength(2);
  expect(html.match(/Waiting since/g)).toHaveLength(2);
});

it('leaves out a verdict step parked at the AI cap', async () => {
  workspace.permissions = ['deals.manage'];
  Object.assign(tables, {
    workflow_step_run: [
      { ...waitingStep('s2', 'vet', null), waiting_on: 'cap' },
    ],
  });

  expect(await render()).toContain('Nothing is waiting for a decision');
});

it('leaves out a step already decided while the run has yet to pick the decision up', async () => {
  workspace.permissions = ['deals.manage'];
  Object.assign(tables, {
    workflow_step_run: [
      {
        ...waitingStep('s1', 'ask', {
          prompt: 'Send the LOI to Acme Plumbing?',
        }),
        workflow_approval: [{ approved: true }],
      },
    ],
  });

  const html = await render();

  expect(html).not.toContain('Send the LOI to Acme Plumbing?');
  expect(html).toContain('Nothing is waiting for a decision');
});

function verdict(
  id: string,
  firmId: string,
  firmName: string,
  approval: { reason: string | null; revoked: boolean } | null,
) {
  return {
    id,
    firm_id: firmId,
    fit: false,
    reasons: [],
    firm: { name: firmName },
    firm_verdict_approval: approval && {
      approved_at: '2026-10-19T15:30:00Z',
      reason: approval.reason,
      firm_verdict_revocation: approval.revoked ? [{ verdict_id: id }] : [],
    },
  };
}

it("lists each firm whose latest verdict is approved and not revoked, once, with that approval's reason", async () => {
  workspace.permissions = ['deals.manage'];
  Object.assign(tables, {
    firm_verdict: [
      verdict('v3', 'cedar', 'Cedar Paving', {
        reason: 'Owner is retiring',
        revoked: false,
      }),
      verdict('v2', 'cedar', 'Cedar Paving', {
        reason: 'An older override',
        revoked: false,
      }),
      verdict('v5', 'dune', 'Dune Fencing', null),
      verdict('v4', 'dune', 'Dune Fencing', { reason: null, revoked: false }),
      verdict('v6', 'elm', 'Elm Glass', { reason: null, revoked: true }),
    ],
  });

  const html = await render();

  expect(html.match(/Cedar Paving/g)).toHaveLength(1);
  expect(html).toContain('Override reason: Owner is retiring');
  expect(html).not.toContain('An older override');
  expect(html).not.toContain('Dune Fencing');
  expect(html).not.toContain('Elm Glass');
  expect(html).toContain('Revoke');
});

it('lists the team facts', async () => {
  workspace.permissions = ['deals.manage'];
  Object.assign(tables, {
    decision_fact: [{ id: 'f1', body: 'We skip franchise resales' }],
  });

  expect(await render()).toContain('We skip franchise resales');
});
