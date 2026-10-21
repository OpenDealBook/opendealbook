// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LenderRoomList, type LenderRoomRow } from './lender-room-list';
import { clearScreen, pageText, show } from './lender-test-kit';

const NOW = new Date('2026-10-19T12:00:00.000Z');

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function room(
  activity: Pick<LenderRoomRow, 'lastActivityAt' | 'lastActionAt'>,
): LenderRoomRow {
  return {
    id: 'room-1',
    name: 'First Bank',
    initials: 'FB',
    logoUrl: null,
    status: 'invited',
    access: { kind: 'open', expiresAt: null },
    peopleCount: 1,
    waitingOnUs: 0,
    ...activity,
  };
}

function showRoom(
  activity: Pick<LenderRoomRow, 'lastActivityAt' | 'lastActionAt'>,
) {
  show(<LenderRoomList rows={[room(activity)]} hrefFor={() => '/room'} />);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  clearScreen();
  vi.useRealTimers();
});

describe('room activity next to the status', () => {
  it('says Not opened until the lender first opens the room, keeping the status', () => {
    showRoom({ lastActivityAt: null, lastActionAt: null });

    expect(pageText()).toContain('Invited');
    expect(pageText()).toContain('Not opened');
  });

  it('says Viewed when the lender has only opened the room', () => {
    showRoom({ lastActivityAt: daysAgo(1), lastActionAt: null });

    expect(pageText()).toContain('Viewed');
    expect(pageText()).not.toContain('Not opened');
  });

  it('says Active when the lender did more than open the room in the last 7 days', () => {
    showRoom({ lastActivityAt: daysAgo(2), lastActionAt: daysAgo(6) });

    expect(pageText()).toContain('Active');
  });

  it('says Viewed when the last action is older than 7 days but the lender opened the room since', () => {
    showRoom({ lastActivityAt: daysAgo(1), lastActionAt: daysAgo(9) });

    expect(pageText()).toContain('Viewed');
    expect(pageText()).not.toContain('Active');
  });

  it('says Quiet with the day count after 7 days without any lender activity', () => {
    showRoom({ lastActivityAt: daysAgo(10), lastActionAt: daysAgo(12) });

    expect(pageText()).toContain('Quiet 10 days');
    expect(pageText()).not.toContain('Active');
  });
});

describe('names that may be cut short', () => {
  function titleOf(text: string): string | null | undefined {
    return [...document.querySelectorAll('[title]')]
      .find((element) => element.textContent === text)
      ?.getAttribute('title');
  }

  it('exposes the full room name and deal name as a tooltip', () => {
    const name = 'Harborview Regional Commercial Lending Partners';
    const deal = 'Harborview Medical Office Portfolio Acquisition';
    show(
      <LenderRoomList
        rows={[{ ...room({ lastActivityAt: null, lastActionAt: null }), name }]}
        hrefFor={() => '/room'}
        dealLabelFor={() => deal}
      />,
    );

    expect(titleOf(name)).toBe(name);
    expect(titleOf(deal)).toBe(deal);
  });
});
