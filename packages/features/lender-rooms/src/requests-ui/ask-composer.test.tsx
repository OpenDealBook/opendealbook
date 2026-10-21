// @vitest-environment jsdom
import './test-support/mocks';
import { act, useState } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AskComposer,
  AskComposerForm,
  SendingRequests,
  SendingRows,
} from './ask-composer';
import { fakeRoom } from './test-support/fake-room';
import {
  alerts,
  announced,
  attach,
  button,
  buttons,
  choose,
  clearScreen,
  dialogText,
  field,
  fields,
  pageText,
  press,
  settle,
  show,
  submit,
  type,
} from './test-support/screen';

const faq = vi.hoisted(() => ({
  searches: [] as unknown[],
  results: [] as unknown[],
  searchOutcome: 'found' as 'found' | 'crash' | string,
  opened: [] as unknown[],
  resolved: [] as unknown[],
  unavailable: new Set<string>(),
}));

vi.mock('../faq-ui/actions', () => ({
  searchRoomFaq: async (input: { query: string }) => {
    faq.searches.push(input);

    if (faq.searchOutcome === 'crash') {
      throw new Error('search crashed');
    }

    return faq.searchOutcome === 'found'
      ? { ok: true, value: faq.results }
      : { ok: false, refusal: faq.searchOutcome };
  },
}));

vi.mock('../activity/actions', () => {
  function records(into: 'opened' | 'resolved') {
    return async (input: { entryId: string }) => {
      faq[into].push(input);

      return faq.unavailable.has(input.entryId)
        ? { ok: false, refusal: 'This FAQ entry is no longer available' }
        : { ok: true, value: undefined };
    };
  }

  return {
    recordFaqSuggestionOpened: records('opened'),
    recordFaqSuggestionResolved: records('resolved'),
  };
});

const ROOM = '7d0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11';
const FOLDER = '0a2c7b8e-41d7-4b4e-8f39-6b2f7a0a2b22';
const TITLE = 'What do you need from the deal team?';

function showComposer() {
  show(
    <AskComposerForm roomId={ROOM} privateFolderId={FOLDER} dealName={null} />,
  );
}

beforeEach(() => {
  fakeRoom.reset();
  Object.assign(faq, {
    searches: [],
    results: [],
    searchOutcome: 'found',
    opened: [],
    resolved: [],
    unavailable: new Set(),
  });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(clearScreen);

describe('sending a request', () => {
  it('sends from the title alone', async () => {
    showComposer();

    await type(TITLE, 'Trailing twelve month P&L');
    await submit(TITLE);

    expect(fakeRoom.requests).toEqual([
      { roomId: ROOM, title: 'Trailing twelve month P&L', documentIds: [] },
    ]);
  });

  it('clears the composer and announces that the request was sent', async () => {
    showComposer();

    await type(TITLE, 'Trailing twelve month P&L');
    await submit(TITLE);

    expect(field(TITLE).value).toBe('');
    expect(announced()).toEqual(['Request sent.']);
    expect(fakeRoom.refreshes).toBe(1);
  });

  it('sends the detail when the lender adds some', async () => {
    showComposer();

    await type(TITLE, 'Tax returns');
    await type('Detail (optional)', 'The last three years');
    await submit(TITLE);

    expect(fakeRoom.requests).toMatchObject([
      { title: 'Tax returns', body: 'The last three years' },
    ]);
  });

  it('sends once when the lender sends twice quickly', async () => {
    showComposer();

    await type(TITLE, 'Rent roll');
    field(TITLE).form!.requestSubmit();
    await submit(TITLE);

    expect(fakeRoom.requests).toHaveLength(1);
  });

  it('labels the detail field and its placeholder with the same words', () => {
    showComposer();

    expect(field('Detail (optional)').getAttribute('placeholder')).toBe(
      'Detail (optional)',
    );
  });

  it('calls the button Send request', () => {
    showComposer();

    expect(buttons('Send request')).toHaveLength(1);
  });
});

describe('a request on its way', () => {
  function showComposerWithList() {
    show(
      <SendingRequests sentTo={'Morgan Reyes'}>
        <AskComposerForm
          roomId={ROOM}
          privateFolderId={FOLDER}
          dealName={null}
        />
        <SendingRows
          kind={'ask'}
          shownIds={[]}
          emptyMessage={'No requests yet.'}
        />
      </SendingRequests>,
    );
  }

  it('shows the request in the list at once as sending, then says who it was sent to', async () => {
    fakeRoom.holdSending();
    showComposerWithList();

    expect(pageText()).toContain('No requests yet.');

    await type(TITLE, 'Rent roll');
    await submit(TITLE);
    await settle();

    expect(pageText()).not.toContain('No requests yet.');
    expect(pageText()).toContain('Rent rollSending');

    fakeRoom.releaseSending();
    await settle();

    expect(announced()).toContain('Sent to Morgan Reyes');
  });

  it('takes the row away again when the request is refused', async () => {
    fakeRoom.refusal = 'You are not a member of this lender room';
    showComposerWithList();

    await type(TITLE, 'Rent roll');
    await submit(TITLE);
    await settle();

    expect(pageText()).not.toContain('Sending');
    expect(pageText()).toContain('No requests yet.');
  });

  it('takes the row away again when sending crashes', async () => {
    fakeRoom.crashesAt = ['send'];
    showComposerWithList();

    await type(TITLE, 'Rent roll');
    await submit(TITLE);
    await settle();

    expect(pageText()).not.toContain('Sending');
  });
});

describe('when sending does not work', () => {
  it('shows the refusal from the server as written and keeps what was typed', async () => {
    fakeRoom.refusal = 'You are not a member of this lender room';
    showComposer();

    await type(TITLE, 'Rent roll');
    await submit(TITLE);

    expect(alerts()).toEqual(['You are not a member of this lender room']);
    expect(field(TITLE).value).toBe('Rent roll');
  });

  it('makes the session-ended sentence a link back to this page', async () => {
    fakeRoom.refusal = 'Your session has ended. Sign in again.';
    showComposer();

    await type(TITLE, 'Rent roll');
    await submit(TITLE);

    const link = document.querySelector('[role="alert"] a')!;

    expect(link.textContent).toBe('Your session has ended. Sign in again.');
    expect(link.getAttribute('href')).toBe(
      `/lender/sign-in?next=${encodeURIComponent(`/lender/${ROOM}/requests`)}`,
    );
  });

  it('says something went wrong and keeps the text and files when the server crashes', async () => {
    fakeRoom.crashesAt = ['send'];
    showComposer();

    await type(TITLE, 'Rent roll');
    await attach('Attach files', 'rent-roll.csv');
    await submit(TITLE);

    expect(alerts()).toEqual([
      'Something went wrong. Your text is still here. Try again.',
    ]);
    expect(field(TITLE).value).toBe('Rent roll');
    expect(pageText()).toContain('rent-roll.csv');
  });
});

describe('attaching files', () => {
  it('holds a picked file as ready to send without adding it to the room', async () => {
    showComposer();

    await attach('Attach files', 'rent-roll.csv');

    expect(pageText()).toContain('rent-roll.csv');
    expect(pageText()).toContain('Ready to send');
    expect(fakeRoom.registered).toEqual([]);
  });

  it('adds the file to the room when the request is sent', async () => {
    showComposer();

    await attach('Attach files', 'rent-roll.csv');
    await type(TITLE, 'Rent roll questions');
    await submit(TITLE);

    expect(fakeRoom.registered).toEqual([
      { uploadId: 'upload:rent-roll.csv', keepAsZip: false },
    ]);
    expect(fakeRoom.requests).toMatchObject([
      { documentIds: ['document:upload:rent-roll.csv'] },
    ]);
  });

  it('cancels a waiting file the lender removes, so it never reaches the room', async () => {
    showComposer();

    await attach('Attach files', 'wrong-file.pdf');
    await press('Remove wrong-file.pdf');
    await type(TITLE, 'Rent roll questions');
    await submit(TITLE);

    expect(fakeRoom.cancelled).toEqual(['upload:wrong-file.pdf']);
    expect(fakeRoom.registered).toEqual([]);
    expect(pageText()).not.toContain('wrong-file.pdf');
  });

  it('cancels waiting files when the lender leaves without sending', async () => {
    showComposer();

    await attach('Attach files', 'rent-roll.csv');
    clearScreen();
    await settle();

    expect(fakeRoom.cancelled).toEqual(['upload:rent-roll.csv']);
  });

  it('moves focus to the attach button after the last row is removed', async () => {
    showComposer();

    await attach('Attach files', 'wrong-file.pdf');
    await press('Remove wrong-file.pdf');

    expect(document.activeElement).toBe(button('Attach files'));
  });

  it('moves focus to the next row when a row above it is removed', async () => {
    showComposer();

    await attach('Attach files', 'first.pdf', 'second.pdf');
    await press('Remove first.pdf');

    expect(document.activeElement).toBe(button('Remove second.pdf'));
  });

  it('announces upload progress', async () => {
    showComposer();

    await attach('Attach files', 'rent-roll.csv');

    expect(announced()).toEqual(['rent-roll.csv is ready to send.']);
  });

  it('says why Send is unavailable while a file is still uploading', async () => {
    fakeRoom.holdStorage();
    showComposer();

    await attach('Attach files', 'rent-roll.csv');

    expect(button('Send request').disabled).toBe(true);
    expect(pageText()).toContain('Waiting for files to finish uploading');

    fakeRoom.releaseStorage();
    await settle();

    expect(button('Send request').disabled).toBe(false);
    expect(pageText()).not.toContain('Waiting for files to finish uploading');
  });
});

describe('an upload that fails', () => {
  it('names the file, hides the storage error, and offers to try again', async () => {
    fakeRoom.crashesAt = ['store'];
    showComposer();

    await attach('Attach files', 'rent-roll.csv');

    expect(pageText()).toContain(
      'rent-roll.csv could not be uploaded. Try again.',
    );
    expect(pageText()).not.toContain('S3 said');
    expect(buttons('Try rent-roll.csv again')).toHaveLength(1);
    expect(buttons('Remove rent-roll.csv')).toHaveLength(1);
  });

  it('stops spinning when the first step crashes', async () => {
    fakeRoom.crashesAt = ['begin'];
    showComposer();

    await attach('Attach files', 'rent-roll.csv');

    expect(pageText()).toContain(
      'rent-roll.csv could not be uploaded. Try again.',
    );
    expect(button('Send request').disabled).toBe(false);
  });

  it('uploads the file when the lender tries again', async () => {
    fakeRoom.crashesAt = ['store'];
    showComposer();

    await attach('Attach files', 'rent-roll.csv');
    await press('Try rent-roll.csv again');

    expect(pageText()).toContain('Ready to send');
  });

  it('keeps the request unsent and the text in place when a file cannot be added at send time', async () => {
    fakeRoom.crashesAt = ['register'];
    showComposer();

    await attach('Attach files', 'rent-roll.csv');
    await type(TITLE, 'Rent roll questions');
    await submit(TITLE);

    expect(fakeRoom.requests).toEqual([]);
    expect(field(TITLE).value).toBe('Rent roll questions');
    expect(pageText()).toContain(
      'rent-roll.csv could not be uploaded. Try again.',
    );
  });

  it('shows the file name beside a refusal that does not mention it', async () => {
    showComposer();

    await attach('Attach files', 'walkthrough.mp4');

    expect(pageText()).toContain(
      'walkthrough.mp4 cannot be uploaded: video and audio files are not allowed',
    );
  });
});

describe('zip files', () => {
  it('does not offer the zip choice when no zip is attached', async () => {
    showComposer();

    await attach('Attach files', 'rent-roll.csv');

    expect(fields('Keep this zip as one file')).toEqual([]);
  });

  it('explains the zip choice in visible words', async () => {
    showComposer();

    await attach('Attach files', 'diligence.zip');

    expect(pageText()).toContain('Otherwise it is unpacked into a folder.');
  });

  it('unpacks an attached zip unless the lender keeps it as one file', async () => {
    showComposer();

    await attach('Attach files', 'diligence.zip');
    await type(TITLE, 'Our diligence list');
    await submit(TITLE);

    expect(fakeRoom.registered).toEqual([
      { uploadId: 'upload:diligence.zip', keepAsZip: false },
    ]);
  });

  it('keeps the zip whole when the lender ticks the choice', async () => {
    showComposer();

    await attach('Attach files', 'diligence.zip');
    await choose('Keep this zip as one file');
    await type(TITLE, 'Our diligence list');
    await submit(TITLE);

    expect(fakeRoom.registered).toEqual([
      { uploadId: 'upload:diligence.zip', keepAsZip: true },
    ]);
  });
});

describe('the composer opened from another page', () => {
  function showDialog() {
    show(
      <AskComposer
        roomId={ROOM}
        privateFolderId={FOLDER}
        dealName={'Harbor Freight Co'}
        aboutDocument={{ id: 'doc-9', name: 'Lease abstract.pdf' }}
        trigger={<button type={'button'}>Ask about this file</button>}
      />,
    );
  }

  const DIALOG_TITLE = "What do you need from Harbor Freight Co's team?";

  it('sends the document it was opened about and closes', async () => {
    showDialog();

    await press('Ask about this file');
    expect(dialogText()).toContain('About Lease abstract.pdf');

    await type(DIALOG_TITLE, 'Is this the current lease?');
    await submit(DIALOG_TITLE);

    expect(fakeRoom.requests).toEqual([
      {
        roomId: ROOM,
        title: 'Is this the current lease?',
        documentIds: ['doc-9'],
      },
    ]);
    expect(dialogText()).toBeNull();
  });

  it('asks before discarding typed text when the dialog is dismissed', async () => {
    showDialog();

    await press('Ask about this file');
    await type(DIALOG_TITLE, 'Is this the current lease?');
    await press('Cancel');

    expect(dialogText()).toContain('Discard this request?');

    await press('Keep editing');

    expect(field(DIALOG_TITLE).value).toBe('Is this the current lease?');
  });

  it('closes and cancels waiting files when the lender discards', async () => {
    showDialog();

    await press('Ask about this file');
    await attach('Attach files', 'rent-roll.csv');
    await press('Cancel');
    await press('Discard');
    await settle();

    expect(dialogText()).toBeNull();
    expect(fakeRoom.cancelled).toEqual(['upload:rent-roll.csv']);
  });

  it('closes without asking when nothing was typed or attached', async () => {
    showDialog();

    await press('Ask about this file');
    await press('Cancel');

    expect(dialogText()).toBeNull();
  });
});

describe('the composer opened by its parent', () => {
  function FileMenu() {
    const [isOpen, setIsOpen] = useState(false);

    return (
      <>
        <button type={'button'} onClick={() => setIsOpen(true)}>
          Ask about this file
        </button>
        <p role={'note'}>{isOpen ? 'parent: open' : 'parent: closed'}</p>
        <AskComposer
          roomId={ROOM}
          privateFolderId={FOLDER}
          dealName={null}
          aboutDocument={{ id: 'doc-9', name: 'Lease abstract.pdf' }}
          open={isOpen}
          onOpenChange={setIsOpen}
        />
      </>
    );
  }

  function parentSays() {
    return document.querySelector('[role=note]')!.textContent;
  }

  it('stays closed until the parent opens it, then shows the document it is about', async () => {
    show(<FileMenu />);

    expect(dialogText()).toBeNull();

    await press('Ask about this file');

    expect(dialogText()).toContain('About Lease abstract.pdf');
  });

  it('tells the parent it closed after the request is sent', async () => {
    show(<FileMenu />);

    await press('Ask about this file');
    await type(TITLE, 'Is this the current lease?');
    await submit(TITLE);

    expect(fakeRoom.requests).toEqual([
      {
        roomId: ROOM,
        title: 'Is this the current lease?',
        documentIds: ['doc-9'],
      },
    ]);
    expect(dialogText()).toBeNull();
    expect(parentSays()).toBe('parent: closed');
  });

  it('asks before discarding typed text and stays open for the parent until the lender discards', async () => {
    show(<FileMenu />);

    await press('Ask about this file');
    await type(TITLE, 'Is this the current lease?');
    await press('Cancel');

    expect(dialogText()).toContain('Discard this request?');
    expect(parentSays()).toBe('parent: open');

    await press('Discard');

    expect(dialogText()).toBeNull();
    expect(parentSays()).toBe('parent: closed');
  });

  it('opens empty again after a discarded draft', async () => {
    show(<FileMenu />);

    await press('Ask about this file');
    await type(TITLE, 'Is this the current lease?');
    await press('Cancel');
    await press('Discard');
    await press('Ask about this file');

    expect(field(TITLE).value).toBe('');
  });
});

function faqEntry(id: string, question: string, answer = `Answer ${id}`) {
  return {
    id,
    question,
    answer,
    pinned: false,
    firstPublishedAt: '2026-10-01T09:00:00.000Z',
    updatedAt: '2026-10-01T09:00:00.000Z',
    files: [],
  };
}

const rentRoll = faqEntry(
  'rent-roll',
  'Is the rent roll current?',
  'Yes, as of September.',
);
const taxes = faqEntry('taxes', 'Are the property taxes paid?');
const insurance = faqEntry('insurance', 'Who insures the building?');
const roof = faqEntry('roof', 'How old is the roof?');

async function pauseTyping() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 450));
  });
}

function suggestionNames() {
  const questions = [rentRoll, taxes, insurance, roof].map(
    (entry) => entry.question,
  );

  return [...document.querySelectorAll('button')]
    .map((each) => each.textContent)
    .filter((name) => questions.includes(name));
}

describe('suggesting FAQ answers while the lender types', () => {
  it('suggests at most three entries once the lender pauses after three words', async () => {
    faq.results = [rentRoll, taxes, insurance, roof];
    showComposer();

    await type(TITLE, 'Is the rent');
    await type('Detail (optional)', 'roll current');
    await settle();

    expect(faq.searches).toEqual([]);

    await pauseTyping();

    expect(faq.searches).toEqual([
      { roomId: ROOM, query: 'Is the rent roll current' },
    ]);
    expect(suggestionNames()).toEqual([
      rentRoll.question,
      taxes.question,
      insurance.question,
    ]);
  });

  it('does not search before three words are typed', async () => {
    faq.results = [rentRoll];
    showComposer();

    await type(TITLE, 'Rent roll');
    await pauseTyping();

    expect(faq.searches).toEqual([]);
    expect(suggestionNames()).toEqual([]);
  });

  it('refreshes the suggestions as the lender keeps typing and hides them when nothing matches', async () => {
    faq.results = [rentRoll];
    showComposer();

    await type(TITLE, 'Is the rent roll current');
    await pauseTyping();
    faq.results = [taxes];
    await type(TITLE, 'Are the taxes paid');
    await pauseTyping();

    expect(suggestionNames()).toEqual([taxes.question]);

    faq.results = [];
    await type(TITLE, 'Who manages the property');
    await pauseTyping();

    expect(suggestionNames()).toEqual([]);
  });

  it('shows the answer when the lender opens a suggestion and records the opening', async () => {
    faq.results = [rentRoll];
    showComposer();

    await type(TITLE, 'Is the rent roll current');
    await pauseTyping();
    await press(rentRoll.question);

    expect(pageText()).toContain('Yes, as of September.');
    expect(faq.opened).toEqual([{ roomId: ROOM, entryId: 'rent-roll' }]);
  });

  it('says an entry is no longer available instead of its answer, without offering it as the answer', async () => {
    faq.results = [rentRoll];
    faq.unavailable.add('rent-roll');
    showComposer();

    await type(TITLE, 'Is the rent roll current');
    await pauseTyping();
    await press(rentRoll.question);

    expect(alerts()).toEqual(['This FAQ entry is no longer available']);
    expect(pageText()).not.toContain('Yes, as of September.');
    expect(buttons('This answered my question')).toEqual([]);
  });

  it('discards the draft and its waiting files when a suggestion answered the question', async () => {
    faq.results = [rentRoll];
    showComposer();

    await attach('Attach files', 'rent-roll.csv');
    await type(TITLE, 'Is the rent roll');
    await type('Detail (optional)', 'current as of today');
    await pauseTyping();
    await press(rentRoll.question);
    await press('This answered my question');
    await settle();

    expect(faq.resolved).toEqual([{ roomId: ROOM, entryId: 'rent-roll' }]);
    expect(field(TITLE).value).toBe('');
    expect(field('Detail (optional)').value).toBe('');
    expect(fakeRoom.cancelled).toEqual(['upload:rent-roll.csv']);
    expect(pageText()).not.toContain('rent-roll.csv');
    expect(announced()).toEqual(['Glad that helped.']);
    expect(fakeRoom.requests).toEqual([]);
  });

  it('marks a request sent after suggestions were shown, even once they are gone', async () => {
    faq.results = [rentRoll];
    showComposer();

    await type(TITLE, 'Is the rent roll current');
    await pauseTyping();
    faq.results = [];
    await type(TITLE, 'Is the rent roll signed');
    await pauseTyping();
    await submit(TITLE);

    expect(fakeRoom.requests).toEqual([
      {
        roomId: ROOM,
        title: 'Is the rent roll signed',
        documentIds: [],
        afterSuggestion: true,
      },
    ]);
  });

  it('starts the next draft unmarked after a suggestion answered the question', async () => {
    faq.results = [rentRoll];
    showComposer();

    await type(TITLE, 'Is the rent roll current');
    await pauseTyping();
    await press(rentRoll.question);
    await press('This answered my question');
    faq.results = [];
    await type(TITLE, 'Send the lease');
    await submit(TITLE);

    expect(fakeRoom.requests).toEqual([
      { roomId: ROOM, title: 'Send the lease', documentIds: [] },
    ]);
  });

  it('shows a session-ended refusal from the search', async () => {
    faq.searchOutcome = 'Your session has ended. Sign in again.';
    showComposer();

    await type(TITLE, 'Is the rent roll current');
    await pauseTyping();

    expect(alerts()).toEqual(['Your session has ended. Sign in again.']);
  });

  it('shows nothing when the search is refused for another reason', async () => {
    faq.searchOutcome = 'You are not a member of this lender room';
    showComposer();

    await type(TITLE, 'Is the rent roll current');
    await pauseTyping();

    expect(faq.searches).toHaveLength(1);
    expect(alerts()).toEqual([]);
  });

  it('shows nothing when the search crashes', async () => {
    faq.searchOutcome = 'crash';
    showComposer();

    await type(TITLE, 'Is the rent roll current');
    await pauseTyping();

    expect(faq.searches).toHaveLength(1);
    expect(alerts()).toEqual([]);
    expect(suggestionNames()).toEqual([]);
  });
});

describe('suggesting FAQ answers in the composer opened about a file', () => {
  const DIALOG_TITLE = "What do you need from Harbor Freight Co's team?";

  function showDialog() {
    show(
      <AskComposer
        roomId={ROOM}
        privateFolderId={FOLDER}
        dealName={'Harbor Freight Co'}
        aboutDocument={{ id: 'doc-9', name: 'Lease abstract.pdf' }}
        trigger={<button type={'button'}>Ask about this file</button>}
      />,
    );
  }

  it('suggests entries while the lender types', async () => {
    faq.results = [rentRoll];
    showDialog();

    await press('Ask about this file');
    await type(DIALOG_TITLE, 'Is the rent roll current');
    await pauseTyping();

    expect(suggestionNames()).toEqual([rentRoll.question]);
  });

  it('closes, cancels waiting files, and says so when a suggestion answered the question', async () => {
    faq.results = [rentRoll];
    showDialog();

    await press('Ask about this file');
    await attach('Attach files', 'rent-roll.csv');
    await type(DIALOG_TITLE, 'Is the rent roll current');
    await pauseTyping();
    await press(rentRoll.question);
    await press('This answered my question');
    await settle();

    expect(dialogText()).toBeNull();
    expect(fakeRoom.cancelled).toEqual(['upload:rent-roll.csv']);
    expect(faq.resolved).toEqual([{ roomId: ROOM, entryId: 'rent-roll' }]);
    expect(announced()).toEqual(['Glad that helped.']);
  });
});
