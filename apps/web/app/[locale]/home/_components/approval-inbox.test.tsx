// @vitest-environment jsdom
import type { ComponentProps } from 'react';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { ApprovalInbox } from './approval-inbox';
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
  type,
} from './lender-test-kit';

vi.mock(
  'next/navigation',
  async () => (await import('./lender-test-kit')).navigation,
);

type Props = ComponentProps<typeof ApprovalInbox>;

const ACCOUNT = 'a0000000-0000-4000-8000-000000000001';

const run = {
  runId: 'r0000000-0000-4000-8000-000000000001',
  runHref: '/home/team-one/workflows/w1/runs/r1',
  workflowName: 'Vet new firms',
  since: '2026-10-20T14:00:00Z',
};

const plainApproval: Props['waiting'][number] = {
  ...run,
  kind: 'approval',
  stepRunId: 's0000000-0000-4000-8000-000000000001',
  prompt: 'Send the LOI to Acme Plumbing?',
};

const fitVerdict: Props['waiting'][number] = {
  ...run,
  kind: 'verdict',
  stepRunId: 's0000000-0000-4000-8000-000000000002',
  verdictId: 'v0000000-0000-4000-8000-000000000001',
  firmName: 'Acme Plumbing',
  fit: true,
  reasons: ['Inside the deal box', 'Owner is 67'],
};

const notFitVerdict: Props['waiting'][number] = {
  ...fitVerdict,
  stepRunId: 's0000000-0000-4000-8000-000000000003',
  verdictId: 'v0000000-0000-4000-8000-000000000002',
  firmName: 'Bolt Roofing',
  fit: false,
  reasons: ['Revenue below the deal box'],
};

const approvedFirm: Props['approved'][number] = {
  verdictId: 'v0000000-0000-4000-8000-000000000003',
  firmName: 'Cedar Paving',
  approvedAt: '2026-10-19T15:30:00Z',
  overrideReason: null,
};

function showInbox(overrides: Partial<Props> = {}) {
  show(
    <ApprovalInbox
      accountId={ACCOUNT}
      waiting={[]}
      approved={[]}
      {...(fakeActions(
        'decideApproval',
        'decideVerdict',
        'revokeVerdict',
      ) as Pick<Props, 'decideApproval' | 'decideVerdict' | 'revokeVerdict'>)}
      {...overrides}
    />,
  );
}

beforeEach(() => fakeServer.reset());
afterEach(clearScreen);

it('shows a waiting approval with its prompt, workflow, run link and how long it has waited', () => {
  showInbox({ waiting: [plainApproval] });

  const text = pageText();

  expect(text).toContain('Send the LOI to Acme Plumbing?');
  expect(text).toContain('Vet new firms');
  expect(text).toContain('Waiting since Oct 20, 2026, 2:00 PM');
  expect(linkTo('Open run')).toBe('/home/team-one/workflows/w1/runs/r1');
});

it.each([
  ['Approve', true],
  ['Reject', false],
] as const)('%ss a plain approval and refreshes', async (name, approved) => {
  showInbox({ waiting: [plainApproval] });

  await press(name);

  expect(fakeServer.inputsTo('decideApproval')).toEqual([
    {
      accountId: ACCOUNT,
      runId: run.runId,
      stepRunId: plainApproval.stepRunId,
      approved,
    },
  ]);
  expect(fakeServer.refreshes).toBe(1);
});

it('shows a verdict with its firm, call and reasons', () => {
  showInbox({ waiting: [fitVerdict] });

  const text = pageText();

  expect(text).toContain('Acme Plumbing');
  expect(text).toContain('Fit');
  expect(text).toContain('Inside the deal box');
  expect(text).toContain('Owner is 67');
});

it.each([
  ['Approve', true],
  ['Reject', false],
] as const)('%ss a fit verdict without a reason', async (name, approved) => {
  showInbox({ waiting: [fitVerdict] });

  await press(name);

  expect(fakeServer.inputsTo('decideVerdict')).toEqual([
    {
      accountId: ACCOUNT,
      runId: run.runId,
      stepRunId: fitVerdict.stepRunId,
      verdictId: 'v0000000-0000-4000-8000-000000000001',
      approved,
    },
  ]);
});

it('approves a not-fit verdict only as an override with a reason', async () => {
  showInbox({ waiting: [notFitVerdict] });

  expect(pageText()).toContain('Not a fit');
  expect(buttonNames()).toEqual(['Override and approve', 'Reject']);

  await press('Override and approve');
  await type('Override reason', 'Owner is retiring this year');
  await press('Approve with this reason');

  expect(fakeServer.inputsTo('decideVerdict')).toEqual([
    {
      accountId: ACCOUNT,
      runId: run.runId,
      stepRunId: notFitVerdict.stepRunId,
      verdictId: 'v0000000-0000-4000-8000-000000000002',
      approved: true,
      reason: 'Owner is retiring this year',
    },
  ]);
});

it('revokes an approved firm with a reason', async () => {
  showInbox({ approved: [approvedFirm] });

  expect(pageText()).toContain('Cedar Paving');

  await press('Revoke');
  await type('Revoke reason', 'Owner sold to a competitor');
  await press('Revoke with this reason');

  expect(fakeServer.inputsTo('revokeVerdict')).toEqual([
    {
      accountId: ACCOUNT,
      verdictId: approvedFirm.verdictId,
      reason: 'Owner sold to a competitor',
    },
  ]);
  expect(fakeServer.refreshes).toBe(1);
});

it('shows the override reason an approved firm was given', () => {
  showInbox({
    approved: [{ ...approvedFirm, overrideReason: 'Owner is retiring' }],
  });

  expect(pageText()).toContain('Owner is retiring');
});

it('shows the refusal when the server refuses', async () => {
  fakeServer.refusal = 'Give a reason';
  showInbox({ approved: [approvedFirm] });

  await press('Revoke');
  await press('Revoke with this reason');

  expect(alerts()).toEqual(['Give a reason']);
});

it('says when nothing is waiting', () => {
  showInbox();

  expect(pageText()).toContain('Nothing is waiting for a decision');
});
