// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  alerts,
  buttonNames,
  clearScreen,
  fakeServer,
  field,
  pageText,
  press,
  show,
  type,
} from '../lender-test-kit';
import { LendersToNudge } from './lenders-to-nudge';

vi.mock(
  'next/navigation',
  async () => (await import('../lender-test-kit')).navigation,
);
vi.mock('@odb/lender-outreach/nudges/draft-actions.ts', async () =>
  (await import('../lender-test-kit')).fakeActions('draftLenderNudges'),
);
vi.mock('@odb/lender-outreach/nudges/send-actions.ts', async () =>
  (await import('../lender-test-kit')).fakeActions('sendLenderNudge'),
);

const TEAM = '2c1f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11';
const FIRST_BANK = '3d1f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11';

function showNudges() {
  show(
    <LendersToNudge
      accountId={TEAM}
      teamPath={'/home/team-one'}
      quietDays={5}
      lenders={[
        {
          lenderId: FIRST_BANK,
          lenderName: 'First Bank',
          primaryContact: { name: 'Jane Banker', email: 'jane@firstbank.com' },
          deals: [
            {
              roomId: 'room-1',
              dealId: 'deal-1',
              dealName: 'Acme Plumbing',
              daysSilent: 8,
              dueSince: '2026-10-10T00:00:00Z',
            },
          ],
        },
        {
          lenderId: null,
          lenderName: 'River Credit',
          primaryContact: null,
          deals: [
            {
              roomId: 'room-2',
              dealId: 'deal-1',
              dealName: 'Acme Plumbing',
              daysSilent: 6,
              dueSince: '2026-10-12T00:00:00Z',
            },
          ],
        },
      ]}
    />,
  );
}

beforeEach(() => {
  fakeServer.reset();
  fakeServer.values.draftLenderNudges = {
    drafts: [
      {
        lenderId: FIRST_BANK,
        lenderName: 'First Bank',
        to: 'jane@firstbank.com',
        subject: 'Re: Acme Plumbing: financing with Team One',
        body: 'Hi Jane, checking in on Acme Plumbing.',
      },
    ],
    cannotDraft: [
      {
        lenderId: null,
        lenderName: 'River Credit',
        reason: 'Save this lender with a primary contact to draft',
      },
    ],
  };
});

afterEach(clearScreen);

describe('lenders to nudge', () => {
  it('lists each quiet lender with its deals and days quiet', () => {
    showNudges();

    expect(pageText()).toContain('First Bank');
    expect(pageText()).toContain('Acme Plumbing');
    expect(pageText()).toContain('8 days quiet');
    expect(pageText()).toContain('6 days quiet');
  });

  it('drafts nudges for review and shows lenders it cannot draft with the reason', async () => {
    showNudges();

    await press('Draft nudges');

    expect(fakeServer.inputsTo('draftLenderNudges')).toEqual([
      { accountId: TEAM },
    ]);
    expect(field('Message to First Bank').value).toBe(
      'Hi Jane, checking in on Acme Plumbing.',
    );
    expect(pageText()).toContain(
      'River Credit Save this lender with a primary contact to draft',
    );
    expect(fakeServer.inputsTo('sendLenderNudge')).toEqual([]);
  });

  it('sends the reviewed nudge as edited', async () => {
    showNudges();

    await press('Draft nudges');
    await type('Message to First Bank', 'Hi Jane, any news on Acme?');
    await press('Send nudge to First Bank');

    expect(fakeServer.inputsTo('sendLenderNudge')).toEqual([
      {
        accountId: TEAM,
        lenderId: FIRST_BANK,
        subject: 'Re: Acme Plumbing: financing with Team One',
        body: 'Hi Jane, any news on Acme?',
      },
    ]);
    expect(buttonNames()).not.toContain('Send nudge to First Bank');
    expect(pageText()).toContain('Nudge sent to jane@firstbank.com');
    expect(fakeServer.refreshes).toBe(1);
  });

  it('keeps the draft when sending is refused', async () => {
    fakeServer.refusalFor.sendLenderNudge =
      'Connect your team mailbox before sending. Drafts still work without it.';
    showNudges();

    await press('Draft nudges');
    await press('Send nudge to First Bank');

    expect(alerts()).toEqual([
      'Connect your team mailbox before sending. Drafts still work without it.',
    ]);
    expect(buttonNames()).toContain('Send nudge to First Bank');
  });

  it('says so when no lender has gone quiet', () => {
    show(
      <LendersToNudge
        accountId={TEAM}
        teamPath={'/home/team-one'}
        quietDays={5}
        lenders={[]}
      />,
    );

    expect(pageText()).toContain('No lender has gone quiet');
    expect(buttonNames()).not.toContain('Draft nudges');
  });
});
