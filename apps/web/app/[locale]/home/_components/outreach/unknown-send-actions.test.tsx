// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  alerts,
  buttonNames,
  clearScreen,
  dialogText,
  fakeServer,
  pageText,
  press,
  show,
} from '../lender-test-kit';
import { UnknownSendActions } from './unknown-send-actions';

vi.mock('next/navigation', async () => (await import('../lender-test-kit')).navigation);
vi.mock('@odb/outreach-app/server', async () =>
  (await import('../lender-test-kit')).fakeActions('resolveUnknownSend'),
);

const ENROLLMENT = 'e0000000-0000-4000-8000-000000000001';

function showRow(canResolve = true) {
  show(
    <UnknownSendActions
      enrollmentId={ENROLLMENT}
      canResolve={canResolve}
    />,
  );
}

beforeEach(() => fakeServer.reset());
afterEach(clearScreen);

it('explains in plain words why the send is stuck and what a manager can do', () => {
  showRow();

  expect(pageText()).toContain(
    "We couldn't tell whether this email went out. Check the mailbox's sent folder.",
  );
  expect(pageText()).not.toContain('Send result unknown');
  expect(buttonNames()).toEqual(['Mark as sent', 'Retry', 'Stop']);
});

it('shows only the explanation when this viewer cannot settle the send', () => {
  showRow(false);

  expect(pageText()).toContain("We couldn't tell whether this email went out.");
  expect(buttonNames()).toEqual([]);
});

it('marks the send as sent', async () => {
  showRow();

  await press('Mark as sent');

  expect(fakeServer.inputsTo('resolveUnknownSend')).toEqual([
    { enrollmentId: ENROLLMENT, resolution: 'mark_sent' },
  ]);
  expect(fakeServer.refreshes).toBe(1);
});

it('warns that a retry may send a duplicate before sending again', async () => {
  showRow();

  await press('Retry');

  expect(dialogText()).toContain(
    'If the first send went through, this person gets the email twice.',
  );
  expect(fakeServer.calls).toEqual([]);

  await press('Send again');

  expect(fakeServer.inputsTo('resolveUnknownSend')).toEqual([
    { enrollmentId: ENROLLMENT, resolution: 'retry' },
  ]);
  expect(fakeServer.refreshes).toBe(1);
  expect(dialogText()).toBeNull();
});

it('confirms before stopping the sequence for this person', async () => {
  showRow();

  await press('Stop');

  expect(dialogText()).toContain('No more emails in this sequence go to this person.');
  expect(fakeServer.calls).toEqual([]);

  await press('Stop sequence');

  expect(fakeServer.inputsTo('resolveUnknownSend')).toEqual([
    { enrollmentId: ENROLLMENT, resolution: 'stop' },
  ]);
  expect(fakeServer.refreshes).toBe(1);
  expect(dialogText()).toBeNull();
});

it('shows why the server refused', async () => {
  fakeServer.refusal = 'Only deal managers can settle an unknown send. Ask a deal manager.';
  showRow();

  await press('Mark as sent');

  expect(alerts()).toEqual([
    'Only deal managers can settle an unknown send. Ask a deal manager.',
  ]);
  expect(fakeServer.refreshes).toBe(0);
});
