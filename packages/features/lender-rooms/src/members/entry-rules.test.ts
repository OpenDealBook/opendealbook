import { describe, expect, it } from 'vitest';

import {
  decideConfirmPage,
  notOnboardedDestination,
  safeNextPath,
  signInConfirmUrl,
} from './entry-rules';

const ROOM_PATH = '/lender/4f6b71e4-1c96-42c5-b2f1-bfabc1ea02dd';

describe('notOnboardedDestination', () => {
  it('sends a person with an open room to their rooms list', () => {
    expect(
      notOnboardedDestination([{ is_open: false }, { is_open: true }]),
    ).toBe('/lender');
  });

  it('sends a person whose rooms are all closed to onboarding', () => {
    expect(notOnboardedDestination([{ is_open: false }])).toBe('/onboarding');
  });

  it('sends a person with no rooms to onboarding', () => {
    expect(notOnboardedDestination([])).toBe('/onboarding');
  });
});

describe('signInConfirmUrl', () => {
  it('points the link at the confirm page with the token hash and the return path', () => {
    expect(
      signInConfirmUrl({
        origin: 'https://app.example',
        tokenHash: 'abc123',
        next: '/lender/room-1',
      }),
    ).toBe(
      'https://app.example/auth/confirm?token_hash=abc123&type=magiclink&next=%2Flender%2Froom-1',
    );
  });
});

describe('safeNextPath', () => {
  it.each([
    ['the rooms list', '/lender'],
    ['a room', ROOM_PATH],
    ["a room's requests", `${ROOM_PATH}/requests`],
    ["a room's FAQ", `${ROOM_PATH}/faq`],
    [
      'an ask thread',
      `${ROOM_PATH}/requests/asks/0a2c7b8e-41d7-4b4e-8f39-6b2f7a0a2b22`,
    ],
    [
      'a form thread',
      `${ROOM_PATH}/requests/forms/0a2c7b8e-41d7-4b4e-8f39-6b2f7a0a2b22`,
    ],
  ])('keeps %s', (_label, next) => {
    expect(safeNextPath(next)).toBe(next);
  });

  it.each([
    ['a missing value', null],
    ['an absolute url', 'https://evil.example/lender'],
    ['a protocol-relative url', '//evil.example'],
    ['a backslash host', '/\\evil.example'],
    ['a relative path', 'lender'],
    ['a tab before the host', '/\t/evil.com'],
    ['an encoded newline before the host', '/%0A/evil.com'],
    ['a second redirect', '/auth/callback?next=https://evil.com'],
    ['a room path with a trailing newline', `${ROOM_PATH}\n`],
    ['a room id that is not a uuid', '/lender/not-a-room'],
    ['another page under a room', `${ROOM_PATH}/files`],
    ['a query on a room path', `${ROOM_PATH}?next=//evil.com`],
    ['a thread id that is not a uuid', `${ROOM_PATH}/requests/asks/latest`],
    [
      'a thread id in capitals',
      `${ROOM_PATH}/requests/asks/0A2C7B8E-41D7-4B4E-8F39-6B2F7A0A2B22`,
    ],
    [
      'another kind of thread',
      `${ROOM_PATH}/requests/notes/0a2c7b8e-41d7-4b4e-8f39-6b2f7a0a2b22`,
    ],
    [
      'a page under a thread',
      `${ROOM_PATH}/requests/asks/0a2c7b8e-41d7-4b4e-8f39-6b2f7a0a2b22/edit`,
    ],
    [
      'a thread path with a trailing newline',
      `${ROOM_PATH}/requests/forms/0a2c7b8e-41d7-4b4e-8f39-6b2f7a0a2b22\n`,
    ],
    [
      'a thread path with a backslash',
      `${ROOM_PATH}/requests/asks/0a2c7b8e-41d7-4b4e-8f39-6b2f7a0a2b22\\evil`,
    ],
    ['asks with no thread id', `${ROOM_PATH}/requests/asks`],
    [
      'a file under the FAQ',
      `${ROOM_PATH}/faq/files/0a2c7b8e-41d7-4b4e-8f39-6b2f7a0a2b22`,
    ],
    ['a FAQ path with a trailing newline', `${ROOM_PATH}/faq\n`],
    ['the FAQ under requests', `${ROOM_PATH}/requests/faq`],
  ])('falls back to the rooms list for %s', (_label, next) => {
    expect(safeNextPath(next)).toBe('/lender');
  });
});

describe('decideConfirmPage', () => {
  it('offers to continue to the room for a magic link that returns to a room', () => {
    expect(
      decideConfirmPage(
        new URLSearchParams({
          token_hash: 'abc123',
          type: 'magiclink',
          next: ROOM_PATH,
        }),
      ),
    ).toEqual({
      kind: 'continue',
      tokenHash: 'abc123',
      next: ROOM_PATH,
      destination: 'your lender room',
    });
  });

  it('offers to continue to the rooms list when the return path is not one of ours', () => {
    expect(
      decideConfirmPage(
        new URLSearchParams({
          token_hash: 'abc123',
          type: 'magiclink',
          next: 'https://evil.example',
        }),
      ),
    ).toEqual({
      kind: 'continue',
      tokenHash: 'abc123',
      next: '/lender',
      destination: 'your lender rooms',
    });
  });

  it.each([
    ['a missing token hash', { type: 'magiclink', next: ROOM_PATH }],
    [
      'a type other than magiclink',
      { token_hash: 'abc123', type: 'email', next: ROOM_PATH },
    ],
  ])('sends %s to sign-in with the return path', (_label, params) => {
    expect(decideConfirmPage(new URLSearchParams(params))).toEqual({
      kind: 'sign-in',
      path: `/lender/sign-in?next=${encodeURIComponent(ROOM_PATH)}`,
    });
  });
});
