// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  alerts,
  button,
  clearScreen,
  fakeServer,
  field,
  fields,
  pageText,
  press,
  show,
  type,
} from '../lender-test-kit';
import { TimelineQuestion } from './timeline-question';

vi.mock(
  'next/navigation',
  async () => (await import('../lender-test-kit')).navigation,
);
vi.mock('@odb/lender-rooms/timeline-answer/lender-actions.ts', async () =>
  (await import('../lender-test-kit')).fakeActions('answerTimeline'),
);

const ROOM = '6a1f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11';

beforeEach(() => fakeServer.reset());

afterEach(clearScreen);

describe('the closing timeline question in a lender room', () => {
  it('asks about the date with the reason and marks the current answer', () => {
    show(
      <TimelineQuestion
        roomId={ROOM}
        teamName={'Harbor Acquisitions'}
        closeBy={'2027-03-15'}
        reason={'The seller retires at the end of March'}
        stored={{ answer: 'no', note: null, earliest_close_date: null }}
      />,
    );

    expect(pageText()).toContain('Can you close by March 15, 2027?');
    expect(pageText()).toContain('The seller retires at the end of March');
    expect(button('No').getAttribute('aria-pressed')).toBe('true');
    expect(button('Yes').getAttribute('aria-pressed')).toBe('false');
  });

  it('sends the answer chosen', async () => {
    show(
      <TimelineQuestion
        roomId={ROOM}
        teamName={'Harbor Acquisitions'}
        closeBy={'2027-03-15'}
        reason={null}
        stored={null}
      />,
    );

    await press('Need to talk');

    expect(fakeServer.inputsTo('answerTimeline')).toEqual([
      {
        roomId: ROOM,
        answer: 'need_to_talk',
        note: null,
        earliestCloseDate: null,
      },
    ]);
    expect(fakeServer.refreshes).toBe(1);
  });

  it('tells the lender who was let know once the answer or note is sent', async () => {
    show(
      <TimelineQuestion
        roomId={ROOM}
        teamName={'Harbor Acquisitions'}
        closeBy={'2027-03-15'}
        reason={null}
        stored={{ answer: 'yes', note: null, earliest_close_date: null }}
      />,
    );

    expect(pageText()).not.toContain("We've let");

    await press('Save');

    expect(pageText()).toContain("We've let Harbor Acquisitions know.");
  });

  it('asks for a note only once the lender has answered', () => {
    show(
      <TimelineQuestion
        roomId={ROOM}
        teamName={'Harbor Acquisitions'}
        closeBy={'2027-03-15'}
        reason={null}
        stored={null}
      />,
    );

    expect(fields('Note (optional)')).toEqual([]);
  });

  it('sends a note with a yes, and asks no earliest date', async () => {
    show(
      <TimelineQuestion
        roomId={ROOM}
        teamName={'Harbor Acquisitions'}
        closeBy={'2027-03-15'}
        reason={null}
        stored={{ answer: 'yes', note: null, earliest_close_date: null }}
      />,
    );

    expect(fields('Earliest date you can close')).toEqual([]);

    await type('Note (optional)', 'Appraisal is already ordered');
    await press('Save');

    expect(fakeServer.inputsTo('answerTimeline')).toEqual([
      {
        roomId: ROOM,
        answer: 'yes',
        note: 'Appraisal is already ordered',
        earliestCloseDate: null,
      },
    ]);
  });

  it('asks a lender who said no for the earliest date they can close', async () => {
    show(
      <TimelineQuestion
        roomId={ROOM}
        teamName={'Harbor Acquisitions'}
        closeBy={'2027-03-15'}
        reason={null}
        stored={{ answer: 'no', note: 'Old note', earliest_close_date: null }}
      />,
    );

    expect(field('Note (optional)').value).toBe('Old note');

    await type('Earliest date you can close', '2027-05-15');
    await press('Save');

    expect(fakeServer.inputsTo('answerTimeline')).toEqual([
      {
        roomId: ROOM,
        answer: 'no',
        note: 'Old note',
        earliestCloseDate: '2027-05-15',
      },
    ]);
  });

  it('shows why an answer was refused', async () => {
    fakeServer.refusal = 'Your session has ended. Sign in again.';
    show(
      <TimelineQuestion
        roomId={ROOM}
        teamName={'Harbor Acquisitions'}
        closeBy={'2027-03-15'}
        reason={null}
        stored={null}
      />,
    );

    await press('Yes');

    expect(alerts()).toEqual(['Your session has ended. Sign in again.']);
  });
});
