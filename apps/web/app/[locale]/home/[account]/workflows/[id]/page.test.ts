import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';

import WorkflowDetailPage from './page';
import { tables } from './workflow-route-test-kit';

vi.mock(
  'next/navigation',
  async () => (await import('./workflow-route-test-kit')).routeMocks.navigation,
);
vi.mock(
  '@odb/supabase/server',
  async () => (await import('./workflow-route-test-kit')).routeMocks.supabase,
);
vi.mock(
  '@odb/supabase/admin',
  async () => (await import('./workflow-route-test-kit')).routeMocks.admin,
);
vi.mock(
  '../../layout',
  async () => (await import('./workflow-route-test-kit')).routeMocks.layout,
);
vi.mock('./actions', () => ({ cancelWaitingRunsAction: async () => {} }));

afterEach(() => {
  for (const table of Object.keys(tables)) {
    delete tables[table];
  }
});

function open(id: string) {
  return WorkflowDetailPage({
    params: Promise.resolve({ account: 'acme', id }),
  });
}

it('is not found for a workflow id that is not a uuid', async () => {
  await expect(open('not-a-workflow')).rejects.toThrow('NEXT_NOT_FOUND');
});

it('is not found for an unknown or other team workflow', async () => {
  await expect(open('00000000-0000-4000-8000-0000000000f1')).rejects.toThrow(
    'NEXT_NOT_FOUND',
  );
});

it('names a publisher whose account is gone as Removed user', async () => {
  Object.assign(tables, {
    workflow: {
      id: '00000000-0000-4000-8000-0000000000c1',
      name: 'New deal alert',
      enabled: false,
      archived_at: null,
    },
    workflow_version: [
      {
        id: '00000000-0000-4000-8000-0000000000d1',
        published_at: '2026-10-12T15:30:00Z',
        published_by: '00000000-0000-4000-8000-0000000000e1',
        saved_at: '2026-10-11T09:00:00Z',
      },
    ],
    workflow_run: [],
    accounts: [],
  });

  const html = renderToStaticMarkup(
    await open('00000000-0000-4000-8000-0000000000c1'),
  );

  expect(html).toContain('Published by Removed user');
});
