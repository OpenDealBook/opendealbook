// @vitest-environment jsdom
import './test-support/mocks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RequestActions, RequestThread } from './request-thread';
import { fakeRoom } from './test-support/fake-room';
import {
  alerts,
  announced,
  attach,
  button,
  buttonNames,
  buttons,
  choose,
  clearScreen,
  dialogText,
  field,
  fields,
  key,
  pageText,
  press,
  settle,
  show,
  type,
} from './test-support/screen';
import type { ThreadEntry } from './thread';

const ROOM = '7d0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11';
const FOLDER = '0a2c7b8e-41d7-4b4e-8f39-6b2f7a0a2b22';
const RESPONDED = '2026-10-12T10:00:00.000Z';

const ask = {
  kind: 'ask' as const,
  id: 'ask-1',
  title: 'Rent roll',
  body: 'As of September',
  status: 'open' as const,
  first_response_at: null,
  return_route: null,
};

const form = {
  ...ask,
  kind: 'form' as const,
  id: 'form-1',
  return_route: 'upload' as const,
};

const answered = {
  ...ask,
  status: 'answered' as 'answered' | 'closed',
  first_response_at: RESPONDED as string | null,
};

const place = {
  roomId: ROOM,
  privateFolderId: FOLDER,
  dealName: null,
  esignAvailable: true,
};

function formFile(name: string) {
  return {
    isAvailable: true as const,
    documentId: 'doc-blank',
    name,
    role: 'blank_form' as const,
    label: 'Form to complete',
  };
}

function showThread(
  request: typeof ask | typeof form | typeof answered,
  thread: ThreadEntry[] = [],
  canAct = true,
) {
  show(
    <RequestThread
      {...place}
      lenderName={'First Harbor Bank'}
      dealName={'Harbor Freight Co'}
      request={request}
      thread={thread}
      canAct={canAct}
    />,
  );
}

beforeEach(() => {
  fakeRoom.reset();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(clearScreen);

describe('what a lender may do with a request', () => {
  it('offers edit, withdraw, and close before the first response', () => {
    show(<RequestActions {...place} request={ask} />);

    expect(buttonNames()).toEqual(['Edit', 'Withdraw', 'Close']);
  });

  it('also offers replacing the file and changing the route on a form before the first response', () => {
    show(
      <RequestActions
        {...place}
        request={form}
        formFile={formFile('app.pdf')}
      />,
    );

    expect(buttonNames()).toEqual([
      'Edit',
      'Replace file',
      'Change how it is returned',
      'Withdraw',
      'Close',
    ]);
  });
});

describe('withdrawing and closing', () => {
  it('says what withdrawing will do before doing it', async () => {
    show(<RequestActions {...place} request={ask} />);

    await press('Withdraw');

    expect(dialogText()).toContain('Withdraw this request?');
    expect(dialogText()).toContain(
      'The deal team will see it as withdrawn and stop working on it.',
    );
    expect(fakeRoom.moves).toEqual([]);
  });

  it('withdraws when the lender confirms', async () => {
    show(<RequestActions {...place} request={form} />);

    await press('Withdraw');
    await press('Withdraw request');

    expect(fakeRoom.moves).toEqual(['withdrawn']);
    expect(dialogText()).toBeNull();
  });

  it('does nothing when the lender cancels', async () => {
    show(<RequestActions {...place} request={ask} />);

    await press('Close');
    await press('Cancel');

    expect(fakeRoom.moves).toEqual([]);
    expect(dialogText()).toBeNull();
  });

  it('shows a refusal inside the confirmation', async () => {
    fakeRoom.refusal = 'This request is already withdrawn';
    show(<RequestActions {...place} request={ask} />);

    await press('Close');
    await press('Close request');

    expect(alerts()).toEqual(['This request is already withdrawn']);
    expect(dialogText()).toContain('Close this request?');
  });

  it('says something went wrong when closing crashes', async () => {
    fakeRoom.crashesAt = ['send'];
    show(<RequestActions {...place} request={ask} />);

    await press('Close');
    await press('Close request');

    expect(alerts()).toEqual(['Something went wrong. Try again.']);
  });

  it('moves focus to the request title after a confirmed close', async () => {
    show(
      <>
        <h1 id={'request-title'} tabIndex={-1}>
          Rent roll
        </h1>
        <RequestActions {...place} request={ask} />
      </>,
    );

    await press('Close');
    await press('Close request');
    await settle();

    expect(document.activeElement?.id).toBe('request-title');
  });
});

describe('editing a request', () => {
  it('saves the new title and detail', async () => {
    show(<RequestActions {...place} request={ask} />);

    await press('Edit');
    await type('Title', 'Rent roll as of September');
    await type('Detail (optional)', 'Unit level');
    await press('Save changes');

    expect(fakeRoom.edits).toEqual([
      {
        askId: 'ask-1',
        title: 'Rent roll as of September',
        body: 'Unit level',
      },
    ]);
    expect(dialogText()).toBeNull();
  });

  it('asks before discarding changes', async () => {
    show(<RequestActions {...place} request={ask} />);

    await press('Edit');
    await type('Title', 'Something else');
    await press('Cancel');

    expect(dialogText()).toContain('Discard your changes?');
  });
});

describe('replacing the form file', () => {
  it('sends the new file as the form to complete', async () => {
    show(
      <RequestActions
        {...place}
        request={form}
        formFile={formFile('app.pdf')}
      />,
    );

    await press('Replace file');
    await attach('Choose the new file', 'app-v2.pdf');
    await press('Use this file');

    expect(fakeRoom.replacedWith).toEqual([
      { formId: 'form-1', documentId: 'document:upload:app-v2.pdf' },
    ]);
  });

  it('says what to do when the new file cannot be signed and the form comes back by e-sign', async () => {
    show(
      <RequestActions
        {...place}
        request={{ ...form, return_route: 'esign' }}
        formFile={formFile('app.pdf')}
      />,
    );

    await press('Replace file');
    await attach('Choose the new file', 'rates.xlsx');

    expect(dialogText()).toContain(
      'rates.xlsx cannot be signed electronically. Choose a PDF or Word file, or close this and change how the form is returned first.',
    );
    expect(button('Use this file').disabled).toBe(true);
  });
});

describe('changing how a form is returned', () => {
  it('saves a route the current file allows', async () => {
    show(
      <RequestActions
        {...place}
        request={form}
        formFile={formFile('app.pdf')}
      />,
    );

    await press('Change how it is returned');
    await choose('Sign it electronically');
    await press('Save');

    expect(fakeRoom.routeChanges).toEqual([
      { formId: 'form-1', returnRoute: 'esign' },
    ]);
  });

  it('tells the lender to replace a file that cannot be signed', async () => {
    show(
      <RequestActions
        {...place}
        request={form}
        formFile={formFile('rates.xlsx')}
      />,
    );

    await press('Change how it is returned');

    expect(fields('Sign it electronically')).toEqual([]);
    expect(dialogText()).toContain(
      'To use e-sign, replace the file with a PDF or Word file.',
    );
  });

  it('is not offered on a completed-file form when e-signature is not set up', () => {
    show(
      <RequestActions
        {...place}
        esignAvailable={false}
        request={form}
        formFile={formFile('app.pdf')}
      />,
    );

    expect(buttons('Change how it is returned')).toEqual([]);
    expect(buttons('Replace file')).toHaveLength(1);
  });

  it('is still offered on an earlier e-sign form when e-signature is not set up', async () => {
    show(
      <RequestActions
        {...place}
        esignAvailable={false}
        request={{ ...form, return_route: 'esign' }}
        formFile={formFile('app.pdf')}
      />,
    );

    await press('Change how it is returned');
    await choose('Fill it in and upload it');
    await press('Save');

    expect(fakeRoom.routeChanges).toEqual([
      { formId: 'form-1', returnRoute: 'upload' },
    ]);
  });

  it('is not offered when the form file is no longer available', () => {
    show(
      <RequestActions
        {...place}
        request={form}
        formFile={{
          isAvailable: false,
          documentId: 'doc-blank',
          role: 'blank_form',
          notice: 'The form to complete is no longer available',
        }}
      />,
    );

    expect(buttons('Change how it is returned')).toEqual([]);
  });
});

describe('replying', () => {
  it('sends a message', async () => {
    showThread(ask);

    await type('Reply', 'Adding context');
    await press('Send reply');

    expect(fakeRoom.replies).toEqual([
      { askId: 'ask-1', body: 'Adding context', documentIds: [] },
    ]);
  });

  it('clears the box and announces the reply was sent', async () => {
    showThread(ask);

    await type('Reply', 'Adding context');
    await press('Send reply');

    expect(field('Reply').value).toBe('');
    expect(announced()).toEqual(['Reply sent.']);
  });

  it('sends files with no message', async () => {
    showThread(form);

    await attach('Attach files', 'term-sheet.pdf');
    await press('Send reply');

    expect(fakeRoom.replies).toEqual([
      { formId: 'form-1', documentIds: ['document:upload:term-sheet.pdf'] },
    ]);
  });

  it('cannot be sent empty', () => {
    showThread(ask);

    expect(button('Send reply').disabled).toBe(true);
  });

  it('can revive a closed request', async () => {
    showThread({ ...answered, status: 'closed' });

    await type('Reply', 'One more question');
    await press('Send reply');

    expect(fakeRoom.replies).toMatchObject([{ body: 'One more question' }]);
  });

  it('starts a new line on Enter instead of sending', async () => {
    showThread(ask);

    await type('Reply', 'First line');
    await key('Reply', { key: 'Enter' });

    expect(fakeRoom.replies).toEqual([]);
  });

  it.each([{ ctrlKey: true }, { metaKey: true }])(
    'sends on Enter with %o held',
    async (modifier) => {
      showThread(ask);

      await type('Reply', 'Sent from the keyboard');
      await key('Reply', { key: 'Enter', ...modifier });

      expect(fakeRoom.replies).toMatchObject([
        { body: 'Sent from the keyboard' },
      ]);
    },
  );

  it('keeps the reply when the server crashes', async () => {
    fakeRoom.crashesAt = ['send'];
    showThread(ask);

    await type('Reply', 'Adding context');
    await press('Send reply');

    expect(alerts()).toEqual([
      'Something went wrong. Your text is still here. Try again.',
    ]);
    expect(field('Reply').value).toBe('Adding context');
  });
});

describe('reading a thread', () => {
  const thread: ThreadEntry[] = [
    {
      kind: 'message',
      key: 'opening',
      side: 'lender',
      authorName: 'Dana Ruiz',
      at: '2026-10-01T09:00:00.000Z',
      body: 'Please send the rent roll',
    },
    {
      kind: 'message',
      key: 'm2',
      side: 'lender',
      authorName: null,
      at: '2026-10-01T10:00:00.000Z',
      body: 'From a colleague no longer in the room',
    },
    {
      kind: 'files',
      key: 'f1',
      side: 'internal',
      authorName: null,
      at: '2026-10-02T09:00:00.000Z',
      files: [
        {
          isAvailable: true,
          documentId: 'doc-1',
          name: 'Rent roll.xlsx',
          role: 'fulfilment',
          label: null,
        },
        {
          isAvailable: false,
          documentId: 'doc-2',
          role: 'fulfilment',
          notice: 'A file that is no longer available',
        },
      ],
    },
  ];

  function entries() {
    return [...document.querySelectorAll('[role="log"] > div > div')].map(
      (entry) => entry.textContent ?? '',
    );
  }

  it('names the lender person, their institution, or the deal team on each entry', () => {
    showThread(answered, thread);

    expect(entries()).toEqual([
      expect.stringContaining('Dana Ruiz'),
      expect.stringContaining('First Harbor Bank'),
      expect.stringContaining("Harbor Freight Co's team"),
    ]);
  });

  it('downloads a file through the tracked route', () => {
    showThread(answered, thread);

    expect(
      document
        .querySelector('a[aria-label="Download Rent roll.xlsx"]')
        ?.getAttribute('href'),
    ).toBe(`/lender/${ROOM}/files/doc-1?disposition=download`);
  });

  it('previews a file through the tracked route and closes back to the thread', async () => {
    const requested: string[] = [];
    vi.stubGlobal('fetch', (url: string) => {
      requested.push(url);

      return new Promise(() => {});
    });
    showThread(answered, thread);

    await press('Rent roll.xlsx');

    expect(dialogText()).toContain('Preview of Rent roll.xlsx');
    expect(requested).toEqual([
      `/lender/${ROOM}/files/doc-1?disposition=preview`,
    ]);

    await press('Close');

    expect(dialogText()).toBeNull();
  });

  it('keeps a file that is no longer available as a note in its place', () => {
    showThread(answered, thread);

    expect(entries()[2]).toContain('A file that is no longer available');
    expect(
      document.querySelector('a[href*="doc-2"], button[aria-label*="doc-2"]'),
    ).toBeNull();
  });

  it('has no reply box for someone who is only viewing', () => {
    showThread(answered, thread, false);

    expect(fields('Reply')).toEqual([]);
    expect(pageText()).toContain('Please send the rent roll');
  });
});
