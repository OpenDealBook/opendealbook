// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  alerts,
  clearScreen,
  fakeServer,
  show,
  submit,
  type,
} from './lender-test-kit';
import { NewWorkflowForm } from './new-workflow-form';

const ACCOUNT = '00000000-0000-4000-8000-0000000000a1';
const WORKFLOW = '00000000-0000-4000-8000-0000000000c1';

vi.mock(
  'next/navigation',
  async () => (await import('./lender-test-kit')).navigation,
);
vi.mock('../[account]/workflows/editor-actions', async () =>
  (await import('./lender-test-kit')).fakeActions('createWorkflow'),
);

beforeEach(() => {
  fakeServer.reset();
  fakeServer.values.createWorkflow = { workflowId: WORKFLOW };
});
afterEach(clearScreen);

function open() {
  show(
    <NewWorkflowForm
      accountId={ACCOUNT}
      basePath={'/home/team-one/workflows'}
    />,
  );
}

it('creates the named workflow and opens it in the editor', async () => {
  open();

  await type('Workflow name', 'Overdue notices');
  await submit('Workflow name');

  expect(fakeServer.inputsTo('createWorkflow')).toEqual([
    { accountId: ACCOUNT, name: 'Overdue notices' },
  ]);
  expect(fakeServer.pathname).toBe(`/home/team-one/workflows/${WORKFLOW}/edit`);
});

it('shows a refusal and stays on the list', async () => {
  fakeServer.refusalFor.createWorkflow =
    'Changing a workflow needs workflows.manage';
  open();

  await type('Workflow name', 'Overdue notices');
  await submit('Workflow name');

  expect(alerts()).toEqual(['Changing a workflow needs workflows.manage']);
  expect(fakeServer.pathname).toBe('/home/team-one/deals/deal-1/lenders');
});
