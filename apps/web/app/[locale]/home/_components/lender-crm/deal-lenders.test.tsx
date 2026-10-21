// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  alerts,
  buttonNames,
  choose,
  clearScreen,
  fakeActions,
  fakeServer,
  field,
  pageText,
  press,
  show,
  type,
} from '../lender-test-kit';
import { CloseDeadlineForm, TermsSoughtForm } from './deal-terms';
import { LenderSpinUp } from './lender-spin-up';
import { OutreachDrafts } from './outreach-drafts';
import { TimelineAnswers } from './timeline-answers';

vi.mock(
  'next/navigation',
  async () => (await import('../lender-test-kit')).navigation,
);
vi.mock('@odb/lender-rooms/crm/spin-up/actions.ts', async () =>
  (await import('../lender-test-kit')).fakeActions('spinUpLenderRooms'),
);
vi.mock('@odb/lender-outreach/draft-actions.ts', async () =>
  (await import('../lender-test-kit')).fakeActions('draftLenderOutreach'),
);
vi.mock('@odb/lender-outreach/send-actions.ts', async () =>
  (await import('../lender-test-kit')).fakeActions('sendLenderOutreach'),
);
vi.mock('@odb/lender-rooms/timeline-answer/internal-actions.ts', async () =>
  (await import('../lender-test-kit')).fakeActions('recordTimelineAnswer'),
);

const DEAL = '1b0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11';
const FIRST_BANK = '3d1f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11';
const RIVER = '5f1f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11';
const ROOM = '6a1f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11';

const { setCloseDeadline, saveDealTermsSought } = fakeActions(
  'setCloseDeadline',
  'saveDealTermsSought',
);

beforeEach(() => fakeServer.reset());

afterEach(clearScreen);

describe('the close deadline', () => {
  function showDeadline() {
    show(
      <CloseDeadlineForm
        dealId={DEAL}
        targetClose={'2027-03-01'}
        deadline={null}
        save={setCloseDeadline}
      />,
    );
  }

  it('shows the target close from the closing milestone', () => {
    showDeadline();

    expect(pageText()).toContain('Target close March 1, 2027');
  });

  it('refuses a reason without the date it explains and saves nothing', async () => {
    showDeadline();

    await type('Why that date', 'Seller retires in March');
    await press('Save deadline');

    expect(alerts()).toEqual([
      'Add the must close by date this reason explains.',
    ]);
    expect(fakeServer.inputsTo('setCloseDeadline')).toEqual([]);
  });

  it('saves the date and reason', async () => {
    showDeadline();

    await type('Must close by', '2027-03-15');
    await type('Why that date', 'Seller retires in March');
    await press('Save deadline');

    expect(fakeServer.inputsTo('setCloseDeadline')).toEqual([
      {
        deal_id: DEAL,
        must_close_by: '2027-03-15',
        must_close_reason: 'Seller retires in March',
      },
    ]);
    expect(fakeServer.refreshes).toBe(1);
  });

  it('stops saying there is no target close once a must close by date is saved', () => {
    show(
      <CloseDeadlineForm
        dealId={DEAL}
        targetClose={null}
        deadline={{ must_close_by: '2027-03-15', must_close_reason: null }}
        save={setCloseDeadline}
      />,
    );

    expect(pageText()).not.toContain('No target close yet');
  });

  it('clears the deadline when both are emptied', async () => {
    show(
      <CloseDeadlineForm
        dealId={DEAL}
        targetClose={null}
        deadline={{ must_close_by: '2027-03-15', must_close_reason: 'Lease' }}
        save={setCloseDeadline}
      />,
    );

    await type('Must close by', '');
    await type('Why that date', '');
    await press('Save deadline');

    expect(fakeServer.inputsTo('setCloseDeadline')).toEqual([
      { deal_id: DEAL, must_close_by: null, must_close_reason: null },
    ]);
  });
});

describe('the terms sought', () => {
  it('opens with terms proposed from the deal calc and saves them as edited', async () => {
    show(
      <TermsSoughtForm
        dealId={DEAL}
        loaded={{
          source: 'proposed',
          terms: {
            loan_amount: 4_000_000,
            loan_type: 'sba_7a',
            term_years: 10,
            rate_type: null,
            seller_note_amount: 500_000,
          },
        }}
        save={saveDealTermsSought}
      />,
    );

    expect(pageText()).toContain('Proposed from the deal calc');
    expect(field('Loan amount ($)').value).toBe('4,000,000');
    expect(field('Seller note ($)').value).toBe('500,000');

    await type('Loan amount ($)', '3800000');
    expect(field('Loan amount ($)').value).toBe('3,800,000');
    await choose('Fixed');
    await type('Notes for lenders', 'Real estate included');
    await press('Save terms');

    expect(fakeServer.inputsTo('saveDealTermsSought')).toEqual([
      {
        deal_id: DEAL,
        loan_amount: 3_800_000,
        loan_type: 'sba_7a',
        term_years: 10,
        rate_type: 'fixed',
        seller_note_amount: 500_000,
        notes: 'Real estate included',
      },
    ]);
  });
});

describe('setting up rooms from saved lenders', () => {
  function showPicker() {
    show(
      <LenderSpinUp
        dealId={DEAL}
        teamPath={'/home/team-one'}
        lenders={[
          { id: FIRST_BANK, name: 'First Bank', primaryName: 'Jane Banker' },
          { id: RIVER, name: 'River Credit', primaryName: null },
        ]}
      />,
    );
  }

  it('cannot pick a lender with no primary contact', () => {
    showPicker();

    expect(field('River Credit').disabled).toBe(true);
    expect(pageText()).toContain('No primary contact');
  });

  it('sets up rooms for the picked lenders and reports each one', async () => {
    fakeServer.values.spinUpLenderRooms = [
      { lenderId: FIRST_BANK, roomId: ROOM, status: 'already_has_room' },
    ];
    showPicker();

    await choose('First Bank');
    await press('Set up 1 room');

    expect(fakeServer.inputsTo('spinUpLenderRooms')).toEqual([
      { dealId: DEAL, lenderIds: [FIRST_BANK] },
    ]);
    expect(pageText()).toContain('First Bank already had a room');
    expect(fakeServer.refreshes).toBe(1);
  });

  it('names the primary contacts whose sign-in email was not sent', async () => {
    fakeServer.values.spinUpLenderRooms = [
      {
        lenderId: FIRST_BANK,
        roomId: ROOM,
        status: 'created',
        emailFailed: true,
      },
    ];
    showPicker();

    await choose('First Bank');
    await press('Set up 1 room');

    expect(pageText()).toContain(
      'Rooms set up, but these contacts got no email: Jane Banker',
    );
  });

  it('offers nothing to set up until a lender is picked', () => {
    showPicker();

    expect(buttonNames()).toContain('Set up rooms');
    expect(
      [...document.querySelectorAll('button')].find(
        (each) => each.textContent === 'Set up rooms',
      )?.disabled,
    ).toBe(true);
  });
});

describe('outreach drafts', () => {
  beforeEach(() => {
    fakeServer.values.draftLenderOutreach = {
      drafts: [
        {
          roomId: ROOM,
          lenderName: 'First Bank',
          to: 'jane@firstbank.com',
          subject: 'Acme: financing with Team One',
          body: 'Hi Jane',
          lastSentAt: null,
        },
        {
          roomId: RIVER,
          lenderName: 'River Credit',
          to: 'ops@river.com',
          subject: 'Acme: financing with Team One',
          body: 'Hi River',
          lastSentAt: '2026-10-01T15:00:00Z',
        },
      ],
      skipped: [
        {
          roomId: 'room-3',
          roomName: 'Summit Capital',
          reason: 'Save this lender with a primary contact to draft',
        },
      ],
    };
  });

  it('drafts for review, listing rooms it skipped with the reason', async () => {
    show(<OutreachDrafts dealId={DEAL} />);

    await press('Draft outreach');

    expect(field('Message to First Bank').value).toBe('Hi Jane');
    expect(pageText()).toContain(
      'Summit Capital Save this lender with a primary contact to draft',
    );
  });

  it('sends a first email as edited', async () => {
    show(<OutreachDrafts dealId={DEAL} />);

    await press('Draft outreach');
    await type('Subject for First Bank', 'Acme financing');
    await press('Send to First Bank');

    expect(fakeServer.inputsTo('sendLenderOutreach')).toEqual([
      {
        roomId: ROOM,
        subject: 'Acme financing',
        body: 'Hi Jane',
        confirmResend: false,
      },
    ]);
    expect(pageText()).toContain('Sent to jane@firstbank.com');
  });

  it('warns before sending again and confirms the resend', async () => {
    show(<OutreachDrafts dealId={DEAL} />);

    await press('Draft outreach');

    expect(pageText()).toContain('Already sent on October 1, 2026');

    await press('Send again to River Credit');

    expect(fakeServer.inputsTo('sendLenderOutreach')).toEqual([
      expect.objectContaining({ roomId: RIVER, confirmResend: true }),
    ]);
  });

  it('shows a refused send and keeps the draft', async () => {
    fakeServer.refusalFor.sendLenderOutreach =
      "Couldn't send from your mailbox. Try again.";
    show(<OutreachDrafts dealId={DEAL} />);

    await press('Draft outreach');
    await press('Send to First Bank');

    expect(alerts()).toEqual(["Couldn't send from your mailbox. Try again."]);
    expect(buttonNames()).toContain('Send to First Bank');
  });
});

describe('timeline answers', () => {
  it("shows each room's answer and who gave it", () => {
    show(
      <TimelineAnswers
        rooms={[
          {
            id: ROOM,
            name: 'First Bank',
            answer: {
              answer: 'need_to_talk',
              source: 'lender',
              note: null,
              earliest_close_date: null,
            },
          },
          { id: RIVER, name: 'River Credit', answer: null },
        ]}
      />,
    );

    expect(pageText()).toContain('First Bank Need to talk, from the lender');
    expect(pageText()).toContain('River Credit No answer yet');
  });

  it("gives each room's answer the anchor a notice links to", () => {
    show(
      <TimelineAnswers
        rooms={[{ id: ROOM, name: 'First Bank', answer: null }]}
      />,
    );

    expect(
      document.getElementById(`lender-timeline-answer-${ROOM}`)?.textContent,
    ).toContain('First Bank');
  });

  it("shows the lender's note and the earliest date it can close", () => {
    show(
      <TimelineAnswers
        rooms={[
          {
            id: ROOM,
            name: 'First Bank',
            answer: {
              answer: 'no',
              source: 'lender',
              note: 'Appraisal backlog',
              earliest_close_date: '2027-05-15',
            },
          },
        ]}
      />,
    );

    expect(pageText()).toContain('Earliest it can close: May 15, 2027');
    expect(pageText()).toContain('Appraisal backlog');
  });

  it('records an answer by hand', async () => {
    show(
      <TimelineAnswers
        rooms={[{ id: ROOM, name: 'First Bank', answer: null }]}
      />,
    );

    await press('Record yes for First Bank');

    expect(fakeServer.inputsTo('recordTimelineAnswer')).toEqual([
      { roomId: ROOM, answer: 'yes' },
    ]);
    expect(fakeServer.refreshes).toBe(1);
  });
});
