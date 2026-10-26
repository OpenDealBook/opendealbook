import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';

import { tables, workspace } from '../workflow-route-test-kit';
import WorkflowEditPage from './page';

vi.mock(
  'next/navigation',
  async () => (await import('../workflow-route-test-kit')).routeMocks.navigation,
);
vi.mock(
  '@odb/supabase/server',
  async () => (await import('../workflow-route-test-kit')).routeMocks.supabase,
);
vi.mock(
  '../../../layout',
  async () => (await import('../workflow-route-test-kit')).routeMocks.layout,
);
vi.mock('../../editor-actions', () => ({
  saveDraft: async () => {},
  publishDraft: async () => {},
  retryScheduleSync: async () => {},
}));
vi.mock('../../../../_components/workflow-editor-canvas', () => ({
  WorkflowEditorCanvas: () => 'Vendor canvas rendered',
}));

const WORKFLOW = '00000000-0000-4000-8000-0000000000c1';

afterEach(() => {
  for (const table of Object.keys(tables)) {
    delete tables[table];
  }
  workspace.permissions = [];
});

function open(id: string, version?: string) {
  return WorkflowEditPage({
    params: Promise.resolve({ account: 'acme', id }),
    searchParams: Promise.resolve(version ? { version } : {}),
  });
}

it('is not found for a workflow id that is not a uuid', async () => {
  await expect(open('not-a-workflow')).rejects.toThrow('NEXT_NOT_FOUND');
});

it('is not found for an unknown or other team workflow', async () => {
  await expect(open(WORKFLOW)).rejects.toThrow('NEXT_NOT_FOUND');
});

it('renders the toolbar on the server and leaves the vendor canvas to the client', async () => {
  workspace.permissions = ['workflows.manage'];
  Object.assign(tables, {
    workflow: { id: WORKFLOW, name: 'New deal alert' },
    workflow_version: [
      {
        id: '00000000-0000-4000-8000-0000000000d1',
        published_at: null,
        graph: { nodes: [], edges: [] },
        layout: {},
      },
    ],
  });

  const html = renderToStaticMarkup(await open(WORKFLOW));

  expect(html).toContain('New deal alert');
  expect(html).toContain('Save draft');
  expect(html).not.toContain('Vendor canvas rendered');
});
