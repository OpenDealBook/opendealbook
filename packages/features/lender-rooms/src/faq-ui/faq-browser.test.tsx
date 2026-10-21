// @vitest-environment jsdom
import { act } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RoomFaqEntry } from '../faq/queries';
import {
  clearScreen,
  pageText,
  press,
  settle,
  show,
  type,
} from '../requests-ui/test-support/screen';
import { FaqBrowser } from './faq-browser';

const server = vi.hoisted(() => ({
  pagesOpened: [] as unknown[],
  entriesOpened: [] as unknown[],
  searches: [] as unknown[],
  unavailable: new Set<string>(),
  results: {} as Record<string, unknown[]>,
  delays: {} as Record<string, number>,
}));

vi.mock('next/navigation', () => ({ usePathname: () => '/lender/room/faq' }));

vi.mock('../activity/actions', () => ({
  recordFaqPageOpened: async (input: unknown) => {
    server.pagesOpened.push(input);

    return { ok: true, value: undefined };
  },
  recordFaqEntryOpened: async (input: { entryId: string }) => {
    server.entriesOpened.push(input);

    return server.unavailable.has(input.entryId)
      ? { ok: false, refusal: 'This FAQ entry is no longer available' }
      : { ok: true, value: undefined };
  },
}));

vi.mock('./actions', () => ({
  searchRoomFaq: async (input: { query: string }) => {
    server.searches.push(input);

    if (input.query in server.delays) {
      await new Promise((resolve) =>
        setTimeout(resolve, server.delays[input.query]),
      );
    }

    return { ok: true, value: server.results[input.query] ?? [] };
  },
}));

const ROOM_ID = '7d0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11';
const LAST_VISIT = '2026-10-10T12:00:00.000Z';

function entry(
  overrides: Partial<RoomFaqEntry> & { id: string },
): RoomFaqEntry {
  return {
    question: `Question ${overrides.id}`,
    answer: `Answer ${overrides.id}`,
    pinned: false,
    firstPublishedAt: '2026-10-01T09:00:00.000Z',
    updatedAt: '2026-10-01T08:00:00.000Z',
    files: [],
    ...overrides,
  };
}

const rentRoll = entry({
  id: 'rent-roll',
  question: 'Is the rent roll current?',
  answer: 'Yes, as of September.\nRefreshed monthly.',
  pinned: true,
  files: [
    { id: 'f1e2d3c4-0000-4000-8000-000000000001', name: 'rent-roll.xlsx' },
  ],
});
const taxes = entry({
  id: 'taxes',
  question: 'Are the property taxes paid?',
  answer: 'Paid through June.',
  firstPublishedAt: '2026-10-12T09:00:00.000Z',
  updatedAt: '2026-10-12T08:00:00.000Z',
});
const insurance = entry({
  id: 'insurance',
  question: 'Who carries the insurance?',
  answer: 'Harbor Mutual.',
  updatedAt: '2026-10-11T15:30:00.000Z',
});

function questions(): string[] {
  return [...document.querySelectorAll('li h3 button')].map(
    (each) => each.textContent ?? '',
  );
}

function itemFor(question: string): string {
  const item = [...document.querySelectorAll('li')].find(
    (each) => each.querySelector('h3 button')?.textContent === question,
  );

  return (item?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

beforeEach(() => {
  Object.assign(server, {
    pagesOpened: [],
    entriesOpened: [],
    searches: [],
    unavailable: new Set(),
    results: {},
    delays: {},
  });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(clearScreen);

describe('the lender FAQ', () => {
  it('records the page being opened once', async () => {
    show(<FaqBrowser roomId={ROOM_ID} entries={[rentRoll]} since={null} />);
    await settle();

    expect(server.pagesOpened).toEqual([{ roomId: ROOM_ID }]);
  });

  it('lists the questions in the order given, marking pinned ones', () => {
    show(
      <FaqBrowser
        roomId={ROOM_ID}
        entries={[rentRoll, taxes, insurance]}
        since={LAST_VISIT}
      />,
    );

    expect(questions()).toEqual([
      'Is the rent roll current?',
      'Are the property taxes paid?',
      'Who carries the insurance?',
    ]);
    expect(itemFor('Is the rent roll current?')).toContain('Pinned');
    expect(itemFor('Are the property taxes paid?')).not.toContain('Pinned');
  });

  it('marks every entry new on a first visit', () => {
    show(
      <FaqBrowser
        roomId={ROOM_ID}
        entries={[rentRoll, insurance]}
        since={null}
      />,
    );

    expect(itemFor('Is the rent roll current?')).toContain('New');
    expect(itemFor('Who carries the insurance?')).toContain('New');
  });

  it('marks entries published or edited since the last visit as new', () => {
    show(
      <FaqBrowser
        roomId={ROOM_ID}
        entries={[rentRoll, taxes, insurance]}
        since={LAST_VISIT}
      />,
    );

    expect(itemFor('Is the rent roll current?')).not.toContain('New');
    expect(itemFor('Are the property taxes paid?')).toContain('New');
    expect(itemFor('Who carries the insurance?')).toContain('New');
  });

  it('opens an entry to its answer and files, and records the open', async () => {
    show(<FaqBrowser roomId={ROOM_ID} entries={[rentRoll]} since={null} />);

    expect(pageText()).not.toContain('Yes, as of September.');

    await press('Is the rent roll current?');
    await settle();

    expect(pageText()).toContain('Yes, as of September. Refreshed monthly.');
    expect(
      document.querySelector('a[href*="/faq/files/"]')?.getAttribute('href'),
    ).toBe(
      `/lender/${ROOM_ID}/faq/files/f1e2d3c4-0000-4000-8000-000000000001?disposition=preview`,
    );
    expect(pageText()).toContain('rent-roll.xlsx');
    expect(server.entriesOpened).toEqual([
      { roomId: ROOM_ID, entryId: 'rent-roll' },
    ]);
  });

  it('shows when an entry was updated only if it was edited after publishing', async () => {
    show(
      <FaqBrowser
        roomId={ROOM_ID}
        entries={[rentRoll, insurance]}
        since={LAST_VISIT}
      />,
    );

    await press('Is the rent roll current?');
    await press('Who carries the insurance?');
    await settle();

    expect(itemFor('Is the rent roll current?')).not.toContain('Updated ');
    expect(itemFor('Who carries the insurance?')).toContain('Updated ');
    expect(
      document.querySelector('time[datetime="2026-10-11T15:30:00.000Z"]'),
    ).not.toBeNull();
  });

  it('says an entry is no longer available when it was unpublished while the page was open', async () => {
    server.unavailable.add('taxes');
    show(<FaqBrowser roomId={ROOM_ID} entries={[taxes]} since={null} />);

    await press('Are the property taxes paid?');
    await settle();

    expect(pageText()).toContain('This FAQ entry is no longer available');
    expect(pageText()).not.toContain('Paid through June.');
  });

  it('says when there is nothing in the FAQ yet', () => {
    show(<FaqBrowser roomId={ROOM_ID} entries={[]} since={null} />);

    expect(pageText()).toContain('No questions have been answered here yet.');
  });

  describe('searching as you type', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    async function wait(ms: number) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    }

    it('searches once the typing pauses, shows the matches in the order found, and records no terms', async () => {
      server.results = { insurance: [insurance, rentRoll] };
      show(
        <FaqBrowser
          roomId={ROOM_ID}
          entries={[rentRoll, taxes, insurance]}
          since={LAST_VISIT}
        />,
      );
      await wait(0);

      await type('Search the FAQ', 'ins');
      await wait(200);
      await type('Search the FAQ', ' insurance ');
      await wait(399);

      expect(server.searches).toEqual([]);

      await wait(1);

      expect(server.searches).toEqual([
        { roomId: ROOM_ID, query: 'insurance' },
      ]);
      expect(questions()).toEqual([
        'Who carries the insurance?',
        'Is the rent roll current?',
      ]);
      expect(server.pagesOpened).toEqual([{ roomId: ROOM_ID }]);
      expect(
        JSON.stringify([server.pagesOpened, server.entriesOpened]),
      ).not.toContain('ins');
    });

    it('says when a search finds nothing', async () => {
      show(<FaqBrowser roomId={ROOM_ID} entries={[rentRoll]} since={null} />);

      await type('Search the FAQ', 'balloon payment');
      await wait(400);

      expect(questions()).toEqual([]);
      expect(pageText()).toContain(
        'Nothing in the FAQ matches “balloon payment”.',
      );
    });

    it('goes back to the whole FAQ without searching when the box is cleared', async () => {
      server.results = { insurance: [insurance] };
      show(
        <FaqBrowser
          roomId={ROOM_ID}
          entries={[rentRoll, insurance]}
          since={null}
        />,
      );

      await type('Search the FAQ', 'insurance');
      await wait(400);
      await type('Search the FAQ', '  ');

      expect(questions()).toEqual([
        'Is the rent roll current?',
        'Who carries the insurance?',
      ]);

      await wait(400);

      expect(server.searches).toHaveLength(1);
      expect(questions()).toEqual([
        'Is the rent roll current?',
        'Who carries the insurance?',
      ]);
    });

    it('shows the latest search even when an earlier one answers later', async () => {
      server.results = { rent: [rentRoll], taxes: [taxes] };
      server.delays = { rent: 1000 };
      show(
        <FaqBrowser
          roomId={ROOM_ID}
          entries={[rentRoll, taxes, insurance]}
          since={null}
        />,
      );

      await type('Search the FAQ', 'rent');
      await wait(400);
      await type('Search the FAQ', 'taxes');
      await wait(400);
      await wait(1000);

      expect(questions()).toEqual(['Are the property taxes paid?']);
    });

    it('drops a search still in flight when the box is cleared', async () => {
      server.results = { rent: [rentRoll] };
      server.delays = { rent: 1000 };
      show(
        <FaqBrowser
          roomId={ROOM_ID}
          entries={[rentRoll, taxes]}
          since={null}
        />,
      );

      await type('Search the FAQ', 'rent');
      await wait(400);
      await type('Search the FAQ', '');
      await wait(1000);

      expect(questions()).toEqual([
        'Is the rent roll current?',
        'Are the property taxes paid?',
      ]);
    });
  });
});
