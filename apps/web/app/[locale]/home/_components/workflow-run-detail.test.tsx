// @vitest-environment jsdom
import type { ComponentProps } from 'react';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  alerts,
  buttonNames,
  clearScreen,
  fakeActions,
  fakeServer,
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
const RUN = 'r0000000-0000-4000-8000-000000000001';

const failedStep: Props['steps'][number] = {
  id: 's2',
  node_id: 'notify-2',
  attempt: 5,
  status: 'failed',
  input: { channel: 'deals' },
  output: null,
  error: 'Novu rejected the payload',
  started_at: '2026-10-20T14:00:00Z',
  finished_at: '2026-10-20T14:03:00Z',
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
  input: { channel: 'team' },
  output: { delivered: 3 },
  error: null,
  started_at: '2026-10-20T13:59:00Z',
  finished_at: '2026-10-20T13:59:30Z',
  logs: [],
};

function showRun(overrides: Partial<Props> = {}) {
  show(
    <WorkflowRunDetail
      accountId={ACCOUNT}
      run={{ id: RUN, status: 'failed' }}
      steps={[succeededStep, failedStep]}
      labels={{ 'notify-1': 'Tell the team' }}
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
  showRun({ run: { id: RUN, status: 'running' }, unfinished: true });

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
    showRun({ run: { id: RUN, status } });

    expect(buttonNames()).toEqual([]);
  },
);

it('hides the controls without workflows.manage', () => {
  showRun({ canManage: false });
  expect(buttonNames()).toEqual([]);
  clearScreen();

  showRun({
    canManage: false,
    run: { id: RUN, status: 'running' },
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

  expect(pageText().split('Step data was removed after 90 days').length).toBe(2);
});
