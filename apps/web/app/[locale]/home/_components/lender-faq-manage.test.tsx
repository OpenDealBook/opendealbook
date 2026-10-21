// @vitest-environment jsdom
import { act } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TeamFaqEntry } from '@odb/lender-rooms/faq/team-queries.ts';
import { fakeRoom } from '@odb/lender-rooms/requests-ui/test-support/fake-room.ts';

import { LenderFaqManager } from './lender-faq-manage';
import {
  alerts,
  attach,
  buttonNames,
  clearScreen,
  dialogText,
  fakeServer,
  field,
  pageText,
  press,
  show,
  type,
} from './lender-test-kit';

vi.mock(
  'next/navigation',
  async () => (await import('./lender-test-kit')).navigation,
);
vi.mock('@odb/lender-rooms/faq/manage.ts', async () =>
  (await import('./lender-test-kit')).fakeActions(
    'editFaqEntry',
    'setFaqEntryStatus',
    'setFaqEntryPinned',
    'removeFaqFile',
    'addDataRoomFileToFaq',
    'beginFaqUpload',
    'addUploadedFaqFile',
    'deleteFaqDraft',
    'hideFaqEntryForRoom',
    'unhideFaqEntryForRoom',
  ),
);
vi.mock(
  '@odb/supabase/client',
  async () =>
    (await import('@odb/lender-rooms/requests-ui/test-support/fake-room.ts'))
      .browserClient,
);

const ENTRY = 'entry-1';
const FIRST_BANK = 'room-1';
const HARBOR = 'room-2';

const rooms = [
  { id: FIRST_BANK, name: 'First Bank' },
  { id: HARBOR, name: 'Harbor Credit Union' },
];

const documents = [
  { id: 'doc-pnl', name: 'P&L 2025.pdf' },
  { id: 'doc-tax', name: 'Tax return.pdf' },
];

function entry(change: Partial<TeamFaqEntry> = {}): TeamFaqEntry {
  return {
    id: ENTRY,
    question: 'What was 2025 EBITDA?',
    answer: 'About 2.1M adjusted.',
    status: 'published',
    pinned: false,
    version: 3,
    files: [{ id: 'file-1', name: 'EBITDA bridge.pdf' }],
    hiddenRoomIds: [],
    ...change,
  };
}

function showManager(
  entries: TeamFaqEntry[] = [entry()],
  dataRoom: typeof documents = documents,
) {
  show(
    <LenderFaqManager entries={entries} rooms={rooms} documents={dataRoom} />,
  );
}

async function pick(label: string, value: string) {
  const select = document.querySelector<HTMLSelectElement>(
    `select[aria-label="${label}"]`,
  )!;

  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

beforeEach(() => {
  fakeServer.reset();
  fakeRoom.reset();
  fakeServer.values.beginFaqUpload = {
    uploadId: 'upload-1',
    path: 'path',
    token: 'token',
  };
});

afterEach(clearScreen);

describe('the FAQ list', () => {
  it('shows each entry in the order given with its status, pin, answer, and files', () => {
    showManager([
      entry({ id: 'a', question: 'Pinned one', pinned: true }),
      entry({ id: 'b', question: 'Draft one', status: 'draft' }),
      entry({ id: 'c', question: 'Pulled one', status: 'unpublished' }),
    ]);

    const headings = [...document.querySelectorAll('article h2')].map(
      (heading) => heading.textContent,
    );
    expect(headings).toEqual(['Pinned one', 'Draft one', 'Pulled one']);
    expect(
      [...document.querySelectorAll('article')].map((article) =>
        [...article.querySelectorAll('[data-slot="badge"]')].map(
          (badge) => badge.textContent,
        ),
      ),
    ).toEqual([['Published', 'Pinned'], ['Draft'], ['Unpublished']]);
    expect(pageText()).toContain('About 2.1M adjusted.');
    expect(pageText()).toContain('EBITDA bridge.pdf');
  });

  it('says how entries get here when there are none', () => {
    showManager([]);

    expect(pageText()).toContain('No FAQ entries yet');
  });
});

describe('changing an entry', () => {
  it('saves new wording against the version shown', async () => {
    showManager();

    await press('Edit');
    await type('Question', 'What was adjusted 2025 EBITDA?');
    await type('Answer', '2.1M.');
    await press('Save changes');

    expect(fakeServer.inputsTo('editFaqEntry')).toEqual([
      {
        entryId: ENTRY,
        question: 'What was adjusted 2025 EBITDA?',
        answer: '2.1M.',
        version: 3,
      },
    ]);
    expect(fakeServer.refreshes).toBe(1);
    expect(buttonNames()).not.toContain('Save changes');
  });

  it('keeps the edit open and says so when someone else saved first', async () => {
    fakeServer.refusalFor.editFaqEntry =
      'Someone else changed this entry. Reload to see their changes.';
    showManager();

    await press('Edit');
    await press('Save changes');

    expect(alerts()).toEqual([
      'Someone else changed this entry. Reload to see their changes.',
    ]);
    expect(field('Question').value).toBe('What was 2025 EBITDA?');
  });

  it.each([
    ['draft', 'Publish', 'published'],
    ['published', 'Unpublish', 'unpublished'],
    ['unpublished', 'Republish', 'published'],
  ] as const)('moves a %s entry on with %s', async (status, label, next) => {
    showManager([entry({ status })]);

    await press(label);

    expect(fakeServer.inputsTo('setFaqEntryStatus')).toEqual([
      { entryId: ENTRY, status: next },
    ]);
    expect(fakeServer.refreshes).toBe(1);
  });

  it('pins and unpins', async () => {
    showManager([entry({ id: 'a' }), entry({ id: 'b', pinned: true })]);

    await press('Pin');
    await press('Unpin');

    expect(fakeServer.inputsTo('setFaqEntryPinned')).toEqual([
      { entryId: 'a', pinned: true },
      { entryId: 'b', pinned: false },
    ]);
  });

  it('shows a refusal as given', async () => {
    fakeServer.refusal = 'This team is read-only until billing is updated.';
    showManager();

    await press('Unpublish');

    expect(alerts()).toEqual([
      'This team is read-only until billing is updated.',
    ]);
  });
});

describe('deleting a draft', () => {
  it('deletes a draft only after the team confirms', async () => {
    showManager([entry({ status: 'draft' })]);

    await press('Delete draft');

    expect(dialogText()).toContain('Delete this draft?');
    expect(fakeServer.inputsTo('deleteFaqDraft')).toEqual([]);

    await press('Yes, delete it');

    expect(fakeServer.inputsTo('deleteFaqDraft')).toEqual([{ entryId: ENTRY }]);
    expect(fakeServer.refreshes).toBe(1);
  });

  it('is not offered once an entry has been published', () => {
    showManager([entry({ status: 'unpublished' })]);

    expect(buttonNames()).not.toContain('Delete draft');
  });
});

describe('entry files', () => {
  it('removes a file', async () => {
    showManager();

    await press('Remove EBITDA bridge.pdf');

    expect(fakeServer.inputsTo('removeFaqFile')).toEqual([
      { fileId: 'file-1' },
    ]);
    expect(fakeServer.refreshes).toBe(1);
  });

  it('adds the data room file the team picks', async () => {
    showManager();

    await pick('Data room file', 'doc-tax');
    await press('Add from data room');

    expect(fakeServer.inputsTo('addDataRoomFileToFaq')).toEqual([
      { entryId: ENTRY, documentId: 'doc-tax' },
    ]);
    expect(fakeServer.refreshes).toBe(1);
  });

  it('uploads a new file and adds it', async () => {
    showManager();

    await attach('Upload a file', 'memo.pdf');

    expect(fakeServer.inputsTo('beginFaqUpload')).toEqual([
      { entryId: ENTRY, name: 'memo.pdf', size: 1 },
    ]);
    expect(fakeServer.inputsTo('addUploadedFaqFile')).toEqual([
      { uploadId: 'upload-1' },
    ]);
    expect(fakeServer.refreshes).toBe(1);
  });
});

describe('entry files when things go wrong or there is nothing to pick', () => {
  it('says something went wrong and adds nothing when storing the upload fails', async () => {
    fakeRoom.crashesAt = ['store'];
    showManager();

    await attach('Upload a file', 'memo.pdf');

    expect(fakeServer.inputsTo('addUploadedFaqFile')).toEqual([]);
    expect(alerts()).toEqual(['Something went wrong. Try again.']);
  });

  it('offers no data room pick when the data room is empty', () => {
    showManager([entry()], []);

    expect(buttonNames()).not.toContain('Add from data room');
  });
});

describe('which rooms show an entry', () => {
  it('hides an entry from one room and shows it again', async () => {
    showManager([entry({ hiddenRoomIds: [HARBOR] })]);

    const shown = (name: string) =>
      document
        .querySelector(`[aria-label="Show in ${name}"]`)
        ?.getAttribute('aria-checked');
    expect(shown('First Bank')).toBe('true');
    expect(shown('Harbor Credit Union')).toBe('false');

    await press('Show in First Bank');
    await press('Show in Harbor Credit Union');

    expect(fakeServer.inputsTo('hideFaqEntryForRoom')).toEqual([
      { roomId: FIRST_BANK, entryId: ENTRY },
    ]);
    expect(fakeServer.inputsTo('unhideFaqEntryForRoom')).toEqual([
      { roomId: HARBOR, entryId: ENTRY },
    ]);
  });
});
