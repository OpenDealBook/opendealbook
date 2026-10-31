// @vitest-environment jsdom
import type { ComponentProps } from 'react';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  alerts,
  announced,
  buttonNames,
  clearScreen,
  dialogText,
  fakeActions,
  fakeServer,
  fields,
  linkTo,
  press,
  show,
  submit,
  type,
} from './lender-test-kit';
import { SCHEDULES_SYNC_FAILED } from '../[account]/workflows/workflow-refusals';
import { WorkflowDetail } from './workflow-detail';

vi.mock(
  'next/navigation',
  async () => (await import('./lender-test-kit')).navigation,
);

type Props = ComponentProps<typeof WorkflowDetail>;

function partsOf(selector: string): string[] {
  return [...document.querySelectorAll(selector)].map((element) =>
    [...element.children]
      .map((child) => (child.textContent ?? '').trim())
      .filter(Boolean)
      .join(' '),
  );
}

const ACCOUNT = 'a0000000-0000-4000-8000-000000000001';
const WORKFLOW = 'w0000000-0000-4000-8000-000000000001';

const props: Props = {
  accountId: ACCOUNT,
  workflowPath: `/home/team-one/workflows/${WORKFLOW}`,
  workflow: {
    id: WORKFLOW,
    name: 'New deal alert',
    enabled: true,
    archived_at: null,
  },
  versions: [
    {
      id: 'v-draft',
      published_at: null,
      publisher: null,
      saved_at: '2026-10-21T14:15:00Z',
    },
    {
      id: 'v2',
      published_at: '2026-10-12T15:30:00Z',
      publisher: 'Avery Lind',
      saved_at: '2026-10-11T09:00:00Z',
    },
    {
      id: 'v1',
      published_at: '2026-10-01T15:30:00Z',
      publisher: 'Jordan Pike',
      saved_at: '2026-09-30T09:00:00Z',
    },
  ],
  runs: [
    {
      id: 'run-new',
      status: 'running',
      trigger_kind: 'manual',
      version_id: 'v2',
      started_at: '2026-10-20T10:00:00Z',
      finished_at: null,
    },
    {
      id: 'run-old',
      status: 'failed',
      trigger_kind: 'schedule',
      version_id: 'v1',
      started_at: '2026-10-02T10:00:00Z',
      finished_at: '2026-10-02T10:05:00Z',
    },
  ],
  canManage: true,
  schedulesSyncFailed: false,
  ...(fakeActions('cancelWaitingRuns', 'renameWorkflow', 'retryScheduleSync') as Pick<
    Props,
    'cancelWaitingRuns' | 'renameWorkflow' | 'retryScheduleSync'
  >),
};

beforeEach(() => fakeServer.reset());
afterEach(clearScreen);

it('heads the page with the name and its enabled and archived state', () => {
  show(<WorkflowDetail {...props} />);
  expect(partsOf('header')).toEqual(['New deal alert Enabled Rename']);
  clearScreen();

  show(
    <WorkflowDetail
      {...props}
      workflow={{ ...props.workflow, enabled: false, archived_at: '2026-10-19T00:00:00Z' }}
    />,
  );
  expect(partsOf('header')).toEqual(['New deal alert Disabled Archived Rename']);
});

it('renames the workflow in place for a workflows manager', async () => {
  show(<WorkflowDetail {...props} />);

  await press('Rename');
  await type('Workflow name', 'Lender alert');
  await submit('Workflow name');

  expect(fakeServer.inputsTo('renameWorkflow')).toEqual([
    { workflowId: WORKFLOW, name: 'Lender alert' },
  ]);
  expect(fakeServer.refreshes).toBe(1);
  expect(fields('Workflow name')).toEqual([]);
});

it('keeps the rename open with the refusal when the server refuses', async () => {
  fakeServer.refusalFor.renameWorkflow = 'Changing a workflow needs workflows.manage';
  show(<WorkflowDetail {...props} />);

  await press('Rename');
  await type('Workflow name', 'Lender alert');
  await submit('Workflow name');

  expect(alerts()).toEqual(['Changing a workflow needs workflows.manage']);
  expect(fields('Workflow name')).toHaveLength(1);
  expect(fakeServer.refreshes).toBe(0);
});

it('cancels a rename without saving', async () => {
  show(<WorkflowDetail {...props} />);

  await press('Rename');
  await press('Cancel');

  expect(fakeServer.inputsTo('renameWorkflow')).toEqual([]);
  expect(partsOf('header')).toEqual(['New deal alert Enabled Rename']);
});

it('lists published versions with publisher and time, and the draft with when it was last saved', () => {
  show(<WorkflowDetail {...props} />);

  expect(partsOf('li')).toEqual([
    'Draft Last saved Oct 21, 2026, 2:15 PM',
    'Version 2 Published by Avery Lind Oct 12, 2026, 3:30 PM',
    'Version 1 Published by Jordan Pike Oct 1, 2026, 3:30 PM',
  ]);
});

it('lists runs newest first with status, trigger, version and times, each linking to its detail', () => {
  show(<WorkflowDetail {...props} />);

  expect(partsOf('tbody tr')).toEqual([
    'Oct 20, 2026, 10:00 AM Running Manual Version 2',
    'Oct 2, 2026, 10:00 AM Failed Schedule Version 1 Oct 2, 2026, 10:05 AM',
  ]);
  expect(linkTo('Oct 20, 2026, 10:00 AM')).toBe(
    `/home/team-one/workflows/${WORKFLOW}/runs/run-new`,
  );
  expect(linkTo('Oct 2, 2026, 10:00 AM')).toBe(
    `/home/team-one/workflows/${WORKFLOW}/runs/run-old`,
  );
});

it('confirms what Cancel waiting runs touches, then reports how many it cancelled', async () => {
  fakeServer.values.cancelWaitingRuns = { cancelled: 3, unreached: 0 };
  show(<WorkflowDetail {...props} />);

  await press('Cancel waiting runs');

  expect(dialogText()).toContain(
    'This cancels unfinished runs on versions older than the latest published version. Runs on the latest version keep going.',
  );
  expect(fakeServer.calls).toEqual([]);

  await press('Cancel older runs');

  expect(fakeServer.inputsTo('cancelWaitingRuns')).toEqual([
    { accountId: ACCOUNT, workflowId: WORKFLOW },
  ]);
  expect(announced()).toContain('Cancelled 3 runs');
  expect(fakeServer.refreshes).toBe(1);
  expect(dialogText()).toBeNull();
});

it('hides Cancel waiting runs without workflows.manage', () => {
  show(<WorkflowDetail {...props} canManage={false} />);

  expect(buttonNames()).toEqual([]);
});

it('shows the refusal in the dialog when the server refuses', async () => {
  fakeServer.refusal = 'Cancelling runs needs workflows.manage';
  show(<WorkflowDetail {...props} />);

  await press('Cancel waiting runs');
  await press('Cancel older runs');

  expect(alerts()).toEqual(['Cancelling runs needs workflows.manage']);
  expect(announced()).toEqual([]);
});

it('hides Cancel waiting runs when nothing is published', () => {
  show(
    <WorkflowDetail
      {...props}
      versions={props.versions.filter((version) => version.published_at === null)}
      runs={[]}
    />,
  );

  expect(buttonNames()).toEqual(['Rename']);
});

it('says how many waiting runs could not be reached', async () => {
  fakeServer.values.cancelWaitingRuns = { cancelled: 3, unreached: 2 };
  show(<WorkflowDetail {...props} />);

  await press('Cancel waiting runs');
  await press('Cancel older runs');

  expect(announced()).toEqual([
    "Cancelled 3 runs. 2 couldn't be reached, try again.",
  ]);
});

it('keeps saying schedules failed to update and lets a manager retry', async () => {
  show(<WorkflowDetail {...props} schedulesSyncFailed />);
  expect(document.body.textContent).toContain(SCHEDULES_SYNC_FAILED);

  await press('Retry schedules');

  expect(fakeServer.inputsTo('retryScheduleSync')).toEqual([{ workflowId: WORKFLOW }]);
  expect(fakeServer.refreshes).toBe(1);
});

it('shows why a retry of the schedules was refused', async () => {
  fakeServer.refusalFor.retryScheduleSync = "Schedules couldn't be updated; try again";
  show(<WorkflowDetail {...props} schedulesSyncFailed />);

  await press('Retry schedules');

  expect(alerts()).toEqual(["Schedules couldn't be updated; try again"]);
});

it('says schedules failed to update without Retry to someone who cannot edit workflows', () => {
  show(<WorkflowDetail {...props} schedulesSyncFailed canManage={false} />);

  expect(document.body.textContent).toContain(SCHEDULES_SYNC_FAILED);
  expect(buttonNames()).not.toContain('Retry schedules');
});

it('says nothing about schedules when the last update reached them', () => {
  show(<WorkflowDetail {...props} />);

  expect(document.body.textContent).not.toContain(SCHEDULES_SYNC_FAILED);
});
