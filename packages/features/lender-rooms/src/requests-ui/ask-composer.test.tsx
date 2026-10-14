// @vitest-environment jsdom
import './test-support/mocks';
import { useState } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AskComposer, AskComposerForm } from './ask-composer';
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
