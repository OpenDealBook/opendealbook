// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SellerRoomActivityEntry } from '@odb/seller-rooms/activity/queries.ts';

vi.mock('./data-room-document-link', () => ({
  DataRoomDocumentLink: ({ documentId }: { documentId: string }) => (
    <button data-document={documentId}>Open</button>
  ),
}));

import { SellerRoomActivity } from './seller-room-activity';

let container: HTMLDivElement;
let root: Root;

const sam = { name: 'Sam Seller', email: 'sam@seller.test', isRemoved: false };

function entry(
  id: string,
  change: Partial<SellerRoomActivityEntry>,
): SellerRoomActivityEntry {
  return {
    id,
    action: 'room_opened',
    side: 'seller',
    person: sam,
    item: null,
    at: '2026-10-01T09:00:00Z',
    ...change,
  };
}

async function render(entries: SellerRoomActivityEntry[]) {
  await act(async () => {
    root.render(<SellerRoomActivity dealId={'deal-1'} entries={entries} />);
  });
}

function rows() {
  return [...container.querySelectorAll('tbody tr')];
}

function cells(row: Element) {
  return [...row.querySelectorAll('td')]
    .slice(0, 3)
    .map((cell) => cell.textContent);
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('the seller room activity table', () => {
  it('says who did what to which item', async () => {
    await render([
      entry('a-1', {
        action: 'folder_opened',
        item: { kind: 'folder', name: 'Financials' },
      }),
      entry('a-2', {
        action: 'meeting_opened',
        item: { kind: 'meeting', name: 'Weekly meeting, Oct 1, 2026' },
      }),
      entry('a-3', {
        action: 'zip_downloaded',
        item: { kind: 'zip', fileCount: 2 },
      }),
      entry('a-4', {
        action: 'document_previewed',
        item: { kind: 'sent', name: 'LOI - Acme.pdf' },
      }),
      entry('a-5', { action: 'room_opened' }),
    ]);

    expect(rows().map(cells)).toEqual([
      ['Sam Seller (sam@seller.test)', 'Opened folder', 'Financials'],
      [
        'Sam Seller (sam@seller.test)',
        'Opened a meeting',
        'Weekly meeting, Oct 1, 2026',
      ],
      ['Sam Seller (sam@seller.test)', 'Downloaded a zip', '2 files'],
      ['Sam Seller (sam@seller.test)', 'Previewed', 'LOI - Acme.pdf'],
      ['Sam Seller (sam@seller.test)', 'Opened the room', ''],
    ]);
  });

  it('marks teammates as internal and removed sellers as removed', async () => {
    await render([
      entry('a-1', {
        side: 'internal',
        person: { name: 'Tia Team', email: 'tia@acme.test', isRemoved: false },
      }),
      entry('a-2', {
        person: { name: null, email: 'rita@seller.test', isRemoved: true },
      }),
    ]);

    expect(rows().map((row) => cells(row)[0])).toEqual([
      'Tia Team (tia@acme.test)Internal',
      'rita@seller.test (removed)',
    ]);
  });

  it('names a teammate who has left the team as a former teammate', async () => {
    await render([
      entry('a-1', {
        side: 'internal',
        person: { name: null, email: null, isRemoved: false },
      }),
    ]);

    expect(cells(rows()[0]!)[0]).toBe('Former teammateInternal');
  });

  it('links a live file to the data room, and names a removed file without a link', async () => {
    await render([
      entry('a-1', {
        action: 'document_downloaded',
        item: {
          kind: 'file',
          documentId: 'doc-live',
          name: 'p-and-l.pdf',
          isRemoved: false,
        },
      }),
      entry('a-2', {
        action: 'document_downloaded',
        item: {
          kind: 'file',
          documentId: 'doc-gone',
          name: 'lease.pdf',
          isRemoved: true,
        },
      }),
    ]);

    const [live, gone] = rows();

    expect(live!.querySelector('[data-document="doc-live"]')).not.toBeNull();
    expect(cells(live!)[2]).toContain('p-and-l.pdf');
    expect(cells(gone!)[2]).toBe('lease.pdf (removed)');
    expect(gone!.querySelector('button, a')).toBeNull();
  });

  it('links an answered question to the question in the card', async () => {
    await render([
      entry('a-1', {
        action: 'question_answered',
        item: { kind: 'question', questionId: 'q-1', title: 'Customer list?' },
      }),
    ]);

    const link = rows()[0]!.querySelector('a')!;

    expect(link.textContent).toBe('Customer list?');
    expect(link.getAttribute('href')).toBe('#seller-question-q-1');
  });

  it('shows the latest 200 until the person asks for all', async () => {
    await render(
      Array.from({ length: 205 }, (_, index) => entry(`a-${index}`, {})),
    );

    expect(rows()).toHaveLength(200);

    const showAll = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Show all 205',
    )!;

    await act(async () => showAll.click());

    expect(rows()).toHaveLength(205);
    expect(container.textContent).not.toContain('Show all');
  });

  it('says nothing has happened yet when the room has no activity', async () => {
    await render([]);

    expect(container.textContent).toContain(
      'Nothing has happened in this room yet',
    );
    expect(container.querySelector('table')).toBeNull();
  });
});
