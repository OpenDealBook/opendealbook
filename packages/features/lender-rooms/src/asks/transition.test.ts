import { describe, expect, it } from 'vitest';

import { type AskMove, type AskState, transitionAsk } from './transition';

const at = '2026-10-13T12:00:00.000Z';
const earlier = '2026-10-01T09:00:00.000Z';

const fresh: AskState = { status: 'open', first_response_at: null };
const openAfterResponse: AskState = {
  status: 'open',
  first_response_at: earlier,
};
const answered: AskState = { status: 'answered', first_response_at: earlier };
const closedUnanswered: AskState = {
  status: 'closed',
  first_response_at: null,
};
const closedAnswered: AskState = {
  status: 'closed',
  first_response_at: earlier,
};
const withdrawn: AskState = { status: 'withdrawn', first_response_at: null };

const answeredNow: AskState = { status: 'answered', first_response_at: at };
const closedNow: AskState = { status: 'closed', first_response_at: at };

const lender = (kind: 'reply' | 'close' | 'edit' | 'withdraw'): AskMove => ({
  side: 'lender',
  kind,
});
const internal = (kind: 'reply' | 'close'): AskMove => ({
  side: 'internal',
  kind,
});

describe('transitionAsk legal moves', () => {
  it.each([
    ['an unanswered open ask stays open', fresh, fresh],
    [
      'an open ask we responded to stays open',
      openAfterResponse,
      openAfterResponse,
    ],
    ['an answered ask reopens', answered, openAfterResponse],
    ['a closed ask we responded to reopens', closedAnswered, openAfterResponse],
    ['a closed ask we never responded to reopens', closedUnanswered, fresh],
    ['a withdrawn ask reopens', withdrawn, fresh],
  ] as const)('lender reply: %s', (_name, from, to) => {
    expect(transitionAsk(from, lender('reply'), at)).toEqual(to);
  });

  it.each([
    ['an unanswered open ask is answered and stamped', fresh, answeredNow],
    [
      'a reopened ask is answered and keeps its stamp',
      openAfterResponse,
      answered,
    ],
    ['an answered ask stays answered', answered, answered],
    ['a closed ask we responded to keeps its stamp', closedAnswered, answered],
    [
      'a closed ask we never responded to is stamped',
      closedUnanswered,
      answeredNow,
    ],
    ['a withdrawn ask is answered and stamped', withdrawn, answeredNow],
  ] as const)('our reply: %s', (_name, from, to) => {
    expect(transitionAsk(from, internal('reply'), at)).toEqual(to);
  });

  it.each([
    ['an unanswered open ask', fresh, closedUnanswered],
    ['an open ask we responded to', openAfterResponse, closedAnswered],
    ['an answered ask', answered, closedAnswered],
    ['a withdrawn ask', withdrawn, closedUnanswered],
  ] as const)(
    'lender close of %s leaves the stamp alone',
    (_name, from, to) => {
      expect(transitionAsk(from, lender('close'), at)).toEqual(to);
    },
  );

  it.each([
    ['an unanswered open ask counts as our first response', fresh, closedNow],
    [
      'an open ask we responded to keeps its stamp',
      openAfterResponse,
      closedAnswered,
    ],
    ['an answered ask keeps its stamp', answered, closedAnswered],
    ['a withdrawn ask counts as our first response', withdrawn, closedNow],
  ] as const)('our close of %s', (_name, from, to) => {
    expect(transitionAsk(from, internal('close'), at)).toEqual(to);
  });

  it('lets the lender edit before our first response', () => {
    expect(transitionAsk(fresh, lender('edit'), at)).toEqual(fresh);
  });

  it('lets the lender withdraw before our first response', () => {
    expect(transitionAsk(fresh, lender('withdraw'), at)).toEqual(withdrawn);
  });
});

describe('transitionAsk rejected moves', () => {
  it.each([
    [
      answered,
      lender('edit'),
      'You can no longer edit this request because the deal team has responded',
    ],
    [
      closedUnanswered,
      lender('edit'),
      'You can no longer edit this request because it is closed',
    ],
    [
      withdrawn,
      lender('edit'),
      'You can no longer edit this request because it is withdrawn',
    ],
    [
      answered,
      lender('withdraw'),
      'You can no longer withdraw this request because the deal team has responded',
    ],
    [
      closedUnanswered,
      lender('withdraw'),
      'You can no longer withdraw this request because it is closed',
    ],
    [withdrawn, lender('withdraw'), 'This request is already withdrawn'],
    [closedAnswered, lender('close'), 'This request is already closed'],
    [closedAnswered, internal('close'), 'This request is already closed'],
    [
      openAfterResponse,
      lender('edit'),
      'You can no longer edit this request because the deal team has responded',
    ],
    [
      openAfterResponse,
      lender('withdraw'),
      'You can no longer withdraw this request because the deal team has responded',
    ],
  ] as const)('%o cannot take %o', (from, move, message) => {
    expect(() => transitionAsk(from, move, at)).toThrow(message);
  });

  it('stops a lender editing an ask we closed without replying, once they reopen it', () => {
    const closedByUs = transitionAsk(fresh, internal('close'), at);
    const reopenedByLender = transitionAsk(closedByUs, lender('reply'), at);

    expect(() => transitionAsk(reopenedByLender, lender('edit'), at)).toThrow(
      'You can no longer edit this request because the deal team has responded',
    );
  });
});

describe('transitionAsk refusals worded for another noun and action', () => {
  it.each([
    [
      openAfterResponse,
      lender('edit'),
      'You can no longer replace this form because the deal team has responded',
    ],
    [
      closedUnanswered,
      lender('edit'),
      'You can no longer replace this form because it is closed',
    ],
    [closedAnswered, internal('close'), 'This form is already closed'],
  ] as const)('%o cannot take %o', (from, move, message) => {
    expect(() =>
      transitionAsk(from, move, at, {
        noun: 'form',
        action: 'replace this form',
      }),
    ).toThrow(message);
  });

  it('names the move itself when no action is given', () => {
    expect(() =>
      transitionAsk(openAfterResponse, lender('withdraw'), at, {
        noun: 'form',
      }),
    ).toThrow(
      'You can no longer withdraw this form because the deal team has responded',
    );
  });
});
