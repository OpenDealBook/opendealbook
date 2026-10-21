// @vitest-environment jsdom
import type { ComponentProps } from 'react';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  alerts,
  buttonNames,
  clearScreen,
  fakeActions,
  fakeServer,
  linkTo,
  pageText,
  press,
  show,
} from './lender-test-kit';
import { WorkflowRunDetail } from './workflow-run-detail';

vi.mock(
  'next/navigation',
  async () => (await import('./lender-test-kit')).navigation,
);

type Props = ComponentProps<typeof WorkflowRunDetail>;

const ACCOUNT = 'a0000000-0000-4000-8000-000000000001';
const noLoopBudget = { loop_items_processed: 0, loop_items_total: 0 };
const RUN = 'r0000000-0000-4000-8000-000000000001';

const failedStep: Props['steps'][number] = {
  id: 's2',
  node_id: 'notify-2',
  attempt: 5,
  status: 'failed',
  wake_at: null,
  waiting_on: null,
  iteration_path: [],
  input: { channel: 'deals' },
  output: null,
  error: 'Novu rejected the payload',
  started_at: '2026-10-20T14:00:00Z',
  finished_at: '2026-10-20T14:03:00Z',
  workflow_approval: [],
  logs: [
    {
      id: 'l1',
      level: 'warn',
      message: 'Retrying notify',
      details: { attempt: 4 },
      created_at: '2026-10-20T14:02:00Z',
    },
    {
      id: 'l2',
      level: 'error',
      message: 'Gave up',
      details: { status: 422 },
      created_at: '2026-10-20T14:03:00Z',
    },
  ],
};

const succeededStep: Props['steps'][number] = {
  id: 's1',
  node_id: 'notify-1',
  attempt: 1,
  status: 'succeeded',
  wake_at: null,
  waiting_on: null,
  iteration_path: [],
  input: { channel: 'team' },
  output: { delivered: 3 },
  error: null,
  started_at: '2026-10-20T13:59:00Z',
  finished_at: '2026-10-20T13:59:30Z',
  workflow_approval: [],
  logs: [],
};

function showRun(overrides: Partial<Props> = {}) {
  show(
    <WorkflowRunDetail
      accountId={ACCOUNT}
      run={{ id: RUN, status: 'failed', error: null, ...noLoopBudget }}
      steps={[succeededStep, failedStep]}
      labels={{ 'notify-1': 'Tell the team', 'each-firm': 'Each firm' }}
      loops={['each-firm']}
      approvalsHref={'/home/team-one/approvals'}
      stepDataRemoved={false}
      unfinished={false}
      canManage
      {...(fakeActions('cancelRun', 'retryRun') as Pick<
        Props,
        'cancelRun' | 'retryRun'
      >)}
      {...overrides}
    />,
  );
}

beforeEach(() => fakeServer.reset());
afterEach(clearScreen);

it('lists each step by label, falling back to its node id, with status, attempt, input, output and error', () => {
  showRun();

  const text = pageText();

  expect(text).toContain('Tell the team');
  expect(text).toContain('notify-2');
  expect(text).toContain('Attempt 5');
  expect(text).toContain('Failed');
  expect(text).toContain('"channel": "deals"');
  expect(text).toContain('"delivered": 3');
  expect(text).toContain('Novu rejected the payload');
});

it('shows each log line with its level and JSON details', () => {
  showRun();

  const text = pageText();

  expect(text).toContain('warn Retrying notify');
  expect(text).toContain('"attempt": 4');
  expect(text).toContain('error Gave up');
  expect(text).toContain('"status": 422');
});

it('notes removed step data only once it has been pruned', () => {
  showRun({ stepDataRemoved: true });
  expect(pageText()).toContain('Step data was removed after 90 days');
  clearScreen();

  showRun();
  expect(pageText()).not.toContain('Step data was removed after 90 days');
});

it('offers Retry, not Cancel, on a failed run, and retries it', async () => {
  showRun();

  expect(buttonNames()).toEqual(['Retry from failed step']);

  await press('Retry from failed step');

  expect(fakeServer.inputsTo('retryRun')).toEqual([
    { accountId: ACCOUNT, runId: RUN },
  ]);
  expect(fakeServer.refreshes).toBe(1);
});

it('offers Cancel, not Retry, on an unfinished run, and cancels it', async () => {
  showRun({
    run: { id: RUN, status: 'running', error: null, ...noLoopBudget },
    unfinished: true,
  });

  expect(buttonNames()).toEqual(['Cancel run']);

  await press('Cancel run');

  expect(fakeServer.inputsTo('cancelRun')).toEqual([
    { accountId: ACCOUNT, runId: RUN },
  ]);
  expect(fakeServer.refreshes).toBe(1);
});

it.each(['succeeded', 'cancelled'] as const)(
  'offers no controls on a %s run',
  (status) => {
    showRun({ run: { id: RUN, status, error: null, ...noLoopBudget } });

    expect(buttonNames()).toEqual([]);
  },
);

it('hides the controls without workflows.manage', () => {
  showRun({ canManage: false });
  expect(buttonNames()).toEqual([]);
  clearScreen();

  showRun({
    canManage: false,
    run: { id: RUN, status: 'running', error: null, ...noLoopBudget },
    unfinished: true,
  });
  expect(buttonNames()).toEqual([]);
});

it('shows the refusal when the server refuses', async () => {
  fakeServer.refusal = 'Cancelling or retrying runs needs workflows.manage';
  showRun();

  await press('Retry from failed step');

  expect(alerts()).toEqual([
    'Cancelling or retrying runs needs workflows.manage',
  ]);
});

it('replaces Retry with a rerun hint once step data was removed', () => {
  showRun({ stepDataRemoved: true });

  expect(buttonNames()).toEqual([]);
  expect(pageText()).toContain(
    'Step data was removed after 90 days. Run the workflow again instead.',
  );
});

it('gives no rerun hint without workflows.manage', () => {
  showRun({ stepDataRemoved: true, canManage: false });

  expect(pageText()).not.toContain('Run the workflow again instead.');
});

it('shows the removed step data notice once to a manager on a failed run', () => {
  showRun({ stepDataRemoved: true });

  expect(pageText().split('Step data was removed after 90 days').length).toBe(
    2,
  );
});

const loopStep = (items: number): Props['steps'][number] => ({
  ...succeededStep,
  id: 's-loop',
  node_id: 'each-firm',
  output: {
    items: Array.from({ length: items }, (_, index) => index),
    processed: 500,
    total: 730,
    resumes: 0,
  },
});

it('says why a run could not start', () => {
  showRun({
    run: {
      id: RUN,
      status: 'failed',
      error: 'Unknown node type "fax"',
      ...noLoopBudget,
    },
    steps: [],
  });

  expect(pageText()).toContain(
    'This run could not start: Unknown node type "fax"',
  );
});

it('says nothing about starting when the run started', () => {
  showRun();

  expect(pageText()).not.toContain('could not start');
});

it('counts the items each loop step took', () => {
  showRun({ steps: [loopStep(12)] });

  expect(pageText()).toContain('12 items');
  expect(pageText()).not.toContain(' of ');
});

it('says when the run left loop items for next time', () => {
  showRun({
    run: {
      id: RUN,
      status: 'succeeded',
      error: null,
      loop_items_processed: 500,
      loop_items_total: 730,
    },
  });
  expect(pageText()).toContain('500 of 730 loop items; the rest run next time');
  clearScreen();

  showRun({
    run: {
      id: RUN,
      status: 'succeeded',
      error: null,
      loop_items_processed: 730,
      loop_items_total: 730,
    },
  });
  expect(pageText()).not.toContain('the rest run next time');
});

it('words a waiting step with the shared status', () => {
  showRun({
    steps: [
      { ...succeededStep, status: 'waiting', output: null, finished_at: null },
    ],
  });

  expect(pageText()).toContain('Waiting');
});

it('replaces Retry with a fix-and-rerun hint when the run never started', () => {
  showRun({
    run: {
      id: RUN,
      status: 'failed',
      error: 'Unknown node type "fax"',
      ...noLoopBudget,
    },
    steps: [],
  });

  expect(buttonNames()).toEqual([]);
  expect(pageText()).toContain(
    'This run never started. Fix the workflow, then run it again.',
  );
});

it('gives no fix-and-rerun hint without workflows.manage', () => {
  showRun({
    run: {
      id: RUN,
      status: 'failed',
      error: 'Unknown node type "fax"',
      ...noLoopBudget,
    },
    steps: [],
    canManage: false,
  });

  expect(pageText()).not.toContain('Fix the workflow');
});

it('says when a waiting step wakes', () => {
  showRun({
    steps: [
      {
        ...succeededStep,
        status: 'waiting',
        output: null,
        finished_at: null,
        wake_at: '2026-10-22T09:00:00Z',
      },
    ],
  });

  expect(pageText()).toContain('Waiting until Oct 22, 2026, 9:00 AM');
});

it('names the loop item each step ran for, counting from one, outermost first', () => {
  showRun({
    steps: [
      { ...succeededStep, id: 'a', iteration_path: [2] },
      { ...succeededStep, id: 'b', iteration_path: [1, 4] },
      { ...succeededStep, id: 'c', iteration_path: [] },
    ],
  });

  expect(
    [...document.querySelectorAll('[data-slot="card-title"]')].map(
      (title) => title.textContent,
    ),
  ).toEqual([
    'Tell the team (item 3)',
    'Tell the team (item 2, 5)',
    'Tell the team',
  ]);
});

it('shows a step waiting on a deal manager as waiting for approval, with a link to decide', () => {
  showRun({
    steps: [
      {
        ...succeededStep,
        node_id: 'approve-loi',
        status: 'waiting',
        waiting_on: 'decision',
        output: { prompt: 'Send the LOI?' },
        finished_at: null,
      },
    ],
  });

  expect(pageText()).toContain('Waiting for approval');
  expect(linkTo('Decide in Approvals')).toBe('/home/team-one/approvals');
});

it('offers no approval link once the step is decided, for a timed wait, or for a step parked at a cap', () => {
  showRun({
    steps: [
      { ...succeededStep, node_id: 'approve-loi' },
      {
        ...succeededStep,
        id: 'w',
        status: 'waiting',
        waiting_on: 'timer',
        finished_at: null,
        wake_at: '2026-10-22T09:00:00Z',
      },
      {
        ...succeededStep,
        id: 'c',
        node_id: 'vet-firm',
        status: 'waiting',
        waiting_on: 'cap',
        output: null,
        finished_at: null,
      },
    ],
  });

  expect(pageText()).not.toContain('Waiting for approval');
  expect(linkTo('Decide in Approvals')).toBeUndefined();
});

it.each([
  [true, 'approved'],
  [false, 'rejected'],
] as const)(
  'shows a decided step the run has yet to pick up as decided %s, without the approval link',
  (approved, word) => {
    showRun({
      steps: [
        {
          ...succeededStep,
          node_id: 'approve-loi',
          status: 'waiting',
          waiting_on: 'decision',
          finished_at: null,
          workflow_approval: [{ approved }],
        },
      ],
    });

    expect(pageText()).toContain(`Decided: ${word}; the run continues shortly`);
    expect(pageText()).not.toContain('Waiting for approval');
    expect(linkTo('Decide in Approvals')).toBeUndefined();
  },
);
