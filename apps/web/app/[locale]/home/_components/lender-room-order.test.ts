import { describe, expect, it } from 'vitest';

import {
  lastLenderActivityAt,
  orderRooms,
  roomAccess,
} from './lender-room-order';

describe('last lender activity', () => {
  it('is null when the lender has done nothing', () => {
    expect(
      lastLenderActivityAt([
        { side: 'internal', at: '2026-10-12T10:00:00.000Z' },
      ]),
    ).toBeNull();
  });

  it('is the newest thing a lender person did, whatever the deal team did later', () => {
    expect(
      lastLenderActivityAt([
        { side: 'internal', at: '2026-10-20T10:00:00.000Z' },
        { side: 'lender', at: '2026-10-02T10:00:00.000Z' },
        { side: 'lender', at: '2026-10-09T10:00:00.000Z' },
      ]),
    ).toBe('2026-10-09T10:00:00.000Z');
  });
});

describe('whether a room is open, closed or expired', () => {
  it('is closed once the team closed it, even if it has also expired', () => {
    expect(
      roomAccess({
        closedAt: '2026-10-01T00:00:00.000Z',
        expiresAt: '2026-09-01T00:00:00.000Z',
        isOpen: false,
      }),
    ).toEqual({ kind: 'closed' });
  });

  it('is expired when the server says it is not open and nobody closed it', () => {
    expect(
      roomAccess({
        closedAt: null,
        expiresAt: '2026-09-01T00:00:00.000Z',
        isOpen: false,
      }),
    ).toEqual({ kind: 'expired', expiredAt: '2026-09-01T00:00:00.000Z' });
  });

  it('is open with its expiry, or with none', () => {
    expect(
      roomAccess({
        closedAt: null,
        expiresAt: '2027-01-05T23:59:59.999Z',
        isOpen: true,
      }),
    ).toEqual({ kind: 'open', expiresAt: '2027-01-05T23:59:59.999Z' });
    expect(
      roomAccess({ closedAt: null, expiresAt: null, isOpen: true }),
    ).toEqual({ kind: 'open', expiresAt: null });
  });
});

describe('overview order', () => {
  const room = (
    id: string,
    kind: 'open' | 'closed',
    waitingOnUs: number,
    lastActivityAt: string | null,
  ) => ({
    id,
    access: kind === 'open' ? { kind, expiresAt: null } : { kind },
    waitingOnUs,
    lastActivityAt,
  });

  it('puts open rooms first; within each, waiting on the deal team, then the most recently active lender, then silent rooms', () => {
    expect(
      orderRooms([
        room('closed-waiting', 'closed', 2, '2026-10-09T10:00:00.000Z'),
        room('silent', 'open', 0, null),
        room('older', 'open', 0, '2026-10-01T10:00:00.000Z'),
        room('waiting-silent', 'open', 1, null),
        room('closed-quiet', 'closed', 0, null),
        room('newer', 'open', 0, '2026-10-05T10:00:00.000Z'),
        room('waiting-active', 'open', 3, '2026-09-01T10:00:00.000Z'),
      ]).map((each) => each.id),
    ).toEqual([
      'waiting-active',
      'waiting-silent',
      'newer',
      'older',
      'silent',
      'closed-waiting',
      'closed-quiet',
    ]);
  });
});
