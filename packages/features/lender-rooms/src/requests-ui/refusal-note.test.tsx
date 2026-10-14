// @vitest-environment jsdom
import './test-support/mocks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageWithAttachments } from './message-with-attachments';
import { ProblemNote, RefusalNote } from './refusal-note';
import { fakeRoom } from './test-support/fake-room';
import { button, clearScreen, press, show } from './test-support/screen';
import { UploadList } from './uploads';

const SESSION_ENDED = 'Your session has ended. Sign in again.';
const LENDER_SIGN_IN = `/lender/sign-in?next=${encodeURIComponent(
  '/lender/7d0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11/requests',
)}`;
const TEAM_SIGN_IN = '/auth/sign-in?next=%2Fhome%2Fdeals%2F1%2Flenders';

function signInLink() {
  return document.querySelector('[role="alert"] a')?.getAttribute('href');
}

beforeEach(() => {
  fakeRoom.reset();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(clearScreen);

describe('the sign-in link on a session-ended refusal', () => {
  it('goes to the lender sign-in page and back to this page by default', () => {
    show(<RefusalNote refusal={SESSION_ENDED} />);

    expect(signInLink()).toBe(LENDER_SIGN_IN);
  });

  it('goes where the caller says instead', () => {
    show(<RefusalNote refusal={SESSION_ENDED} signInPath={TEAM_SIGN_IN} />);

    expect(signInLink()).toBe(TEAM_SIGN_IN);
  });

  it('is passed on by the problem note', () => {
    show(
      <ProblemNote
        problem={{ kind: 'refused', refusal: SESSION_ENDED }}
        signInPath={TEAM_SIGN_IN}
      />,
    );

    expect(signInLink()).toBe(TEAM_SIGN_IN);
  });

  it('is passed on by an upload row', () => {
    show(
      <UploadList
        queue={[
          {
            key: 'a',
            name: 'rent-roll.csv',
            state: { kind: 'refused', message: SESSION_ENDED },
          },
        ]}
        onRemove={() => {}}
        signInPath={TEAM_SIGN_IN}
      />,
    );

    expect(signInLink()).toBe(TEAM_SIGN_IN);
  });

  it('is passed on by a message with attachments', async () => {
    fakeRoom.refusal = SESSION_ENDED;
    show(
      <MessageWithAttachments
        roomId={'room'}
        privateFolderId={'folder'}
        isTyped
        needsTextOrFile
        sendLabel={'Send reply'}
        sentWording={'Reply sent.'}
        discardWording={'Discard this reply?'}
        send={async () => ({ ok: false, refusal: SESSION_ENDED })}
        onSent={() => {}}
        signInPath={TEAM_SIGN_IN}
      >
        <textarea aria-label={'Reply'} />
      </MessageWithAttachments>,
    );

    expect(button('Send reply').disabled).toBe(false);
    await press('Send reply');

    expect(signInLink()).toBe(TEAM_SIGN_IN);
  });
});

describe('the note for a crash', () => {
  it('says only that something went wrong where there is no text to lose', () => {
    show(<ProblemNote problem={{ kind: 'crashed' }} />);

    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      'Something went wrong. Try again.',
    );
  });
});
