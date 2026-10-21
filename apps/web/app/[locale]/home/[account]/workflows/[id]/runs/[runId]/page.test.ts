import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';

import { tables, workspace } from '../../workflow-route-test-kit';
import WorkflowRunPage from './page';

vi.mock(
  'next/navigation',
  async () =>
    (await import('../../workflow-route-test-kit')).routeMocks.navigation,
);
vi.mock(
  '@odb/supabase/server',
  async () => (await import('../../workflow-route-test-kit')).routeMocks.supabase,
);
vi.mock(
  '../../../../layout',
  async () => (await import('../../workflow-route-test-kit')).routeMocks.layout,
);
vi.mock(
  '@odb/supabase/admin',
  async () => (await import('../../workflow-route-test-kit')).routeMocks.admin,
);
vi.mock('../../actions', () => ({
  cancelRunAction: async () => {},
  retryRunAction: async () => {},
}));

const WORKFLOW = '00000000-0000-4000-8000-0000000000c1';
const RUN = '00000000-0000-4000-8000-0000000000b1';

afterEach(() => {
  for (const table of Object.keys(tables)) {
    delete tables[table];
  }
  workspace.permissions = [];
});

const graph = {
  nodes: [
    { id: 'start', type: 'manual_trigger', config: {} },
    { id: 'notify-1', type: 'notify_team', config: {}, label: 'Tell the team' },
  ],
  edges: [{ id: 'e1', sourceNodeId: 'start', targetNodeId: 'notify-1' }],
};

function step(overrides: Record<string, unknown>) {
  return {
    id: 's1',
    node_id: 'notify-1',
    attempt: 1,
    status: 'succeeded',
    input: { channel: 'team' },
    output: { delivered: 3 },
    error: null,
    started_at: '2026-10-20T13:59:00Z',
    finished_at: '2026-10-20T13:59:30Z',
    logs: [],
    ...overrides,
  };
}

function seed(status: string, steps: unknown[], schemaVersion = 1) {
  Object.assign(tables, {
    workflow_run: {
      id: RUN,
      status,
      workflow_version: { schema_version: schemaVersion, graph },
    },
    workflow_step_run: steps,
  });
}

async function render() {
  return renderToStaticMarkup(await open(WORKFLOW, RUN));
}

function open(id: string, runId: string) {
  return WorkflowRunPage({
    params: Promise.resolve({ account: 'acme', id, runId }),
  });
}

it('is not found for a run id that is not a uuid', async () => {
  await expect(open(WORKFLOW, 'not-a-run')).rejects.toThrow('NEXT_NOT_FOUND');
});

it('is not found for a workflow id that is not a uuid', async () => {
  await expect(open('not-a-workflow', RUN)).rejects.toThrow('NEXT_NOT_FOUND');
});

it('is not found for an unknown or other team run', async () => {
  await expect(open(WORKFLOW, RUN)).rejects.toThrow('NEXT_NOT_FOUND');
});

it('labels steps from the parsed version graph', async () => {
  seed('succeeded', [step({})]);

  expect(await render()).toContain('Tell the team');
});

it('refuses to show a run whose version uses an unknown schema version', async () => {
  seed('succeeded', [step({})], 2);

  await expect(render()).rejects.toThrow();
});

it('notes removed step data when a succeeded step has lost its output', async () => {
  seed('succeeded', [step({ output: null })]);

  expect(await render()).toContain('Step data was removed after 90 days');
});

it('keeps the notice away while step outputs are intact', async () => {
  seed('succeeded', [step({})]);

  expect(await render()).not.toContain('Step data was removed');
});

it('offers Cancel on each unfinished status the runner lists, and not on a failed run', async () => {
  workspace.permissions = ['workflows.manage'];

  for (const status of [
    'running',
    'waiting',
    'awaiting_approval',
    'paused_locked',
    'paused_cap',
  ]) {
    seed(status, []);
    expect(await render()).toContain('Cancel run');
  }

  seed('failed', [step({ status: 'failed', output: null, error: 'boom' })]);
  expect(await render()).not.toContain('Cancel run');
});
