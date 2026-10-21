import { describe, expect, it } from 'vitest';

import {
  byWaitingThenActivity,
  openReviews,
  otherSide,
  unreadTeamMessages,
} from './counsel-deals';

const request = (requestedAt: string) => ({
  id: `r-${requestedAt}`,
  requestedBy: 'Dana Lee',
  requestedAt,
});

const decision = (decidedAt: string) => ({
  id: `d-${decidedAt}`,
  decision: 'approved' as const,
  note: null,
  decidedAt,
  withoutCounsel: false,
});

describe('openReviews', () => {
  it('lists the latest version whose latest request their side has not answered', () => {
    expect(
      openReviews([{ type: 'apa', versions: [{ id: 'v1', version: 1 }] }], {
        v1: {
          requests: [request('2026-10-01T10:00:00Z')],
          decisions: [],
        },
      }),
    ).toEqual([
      {
        contract: 'APA',
        version: 1,
        requestedBy: 'Dana Lee',
        requestedAt: '2026-10-01T10:00:00Z',
      },
    ]);
  });

  it('drops a request their side answered after it was made', () => {
    expect(
      openReviews([{ type: 'loi', versions: [{ id: 'v1', version: 1 }] }], {
        v1: {
          requests: [request('2026-10-01T10:00:00Z')],
          decisions: [decision('2026-10-02T10:00:00Z')],
        },
      }),
    ).toEqual([]);
  });

  it('keeps a request made again after their earlier answer', () => {
    expect(
      openReviews([{ type: 'loi', versions: [{ id: 'v1', version: 1 }] }], {
        v1: {
          requests: [
            request('2026-10-01T10:00:00Z'),
            request('2026-10-03T10:00:00Z'),
          ],
          decisions: [decision('2026-10-02T10:00:00Z')],
        },
      }).map((review) => review.requestedAt),
    ).toEqual(['2026-10-03T10:00:00Z']);
  });

  it('ignores requests on a version that a newer one replaced', () => {
    expect(
      openReviews(
        [
          {
            type: 'apa',
            versions: [
              { id: 'v1', version: 1 },
              { id: 'v2', version: 2 },
            ],
          },
        ],
        {
          v1: { requests: [request('2026-10-01T10:00:00Z')], decisions: [] },
          v2: { requests: [], decisions: [] },
        },
      ),
    ).toEqual([]);
  });
});

describe('byWaitingThenActivity', () => {
  it('puts deals with more waiting items first, then the most recently active', () => {
    const deals = [
      { name: 'Quiet', waiting: 0, lastActivityAt: '2026-10-09T00:00:00Z' },
      { name: 'Stale', waiting: 0, lastActivityAt: null },
      { name: 'Busy', waiting: 2, lastActivityAt: '2026-09-01T00:00:00Z' },
      { name: 'Recent', waiting: 0, lastActivityAt: '2026-10-10T00:00:00Z' },
    ];

    expect(deals.sort(byWaitingThenActivity).map((deal) => deal.name)).toEqual([
      'Busy',
      'Recent',
      'Quiet',
      'Stale',
    ]);
  });
});

describe('unreadTeamMessages', () => {
  const message = (id: string, from_team: boolean, created_at: string) => ({
    id,
    author_name: 'Dana Lee',
    from_team,
    body: 'Hello',
    created_at,
  });
  const thread = [
    message('old', true, '2026-10-01T10:00:00Z'),
    message('mine', false, '2026-10-03T10:00:00Z'),
    message('new', true, '2026-10-04T10:00:00Z'),
    message('newer', true, '2026-10-05T10:00:00Z'),
  ];

  it('keeps the deal team messages since their last visit, newest first', () => {
    expect(
      unreadTeamMessages(thread, '2026-10-02T00:00:00Z').map((m) => m.id),
    ).toEqual(['newer', 'new']);
  });

  it('counts every team message as unread before their first visit', () => {
    expect(unreadTeamMessages(thread, null).map((m) => m.id)).toEqual([
      'newer',
      'new',
      'old',
    ]);
  });
});

describe('otherSide', () => {
  it("names the sellers for buyer's counsel", () => {
    expect(otherSide('buyer', ['Walt Brennan'], 'Harbor Holdings')).toBe(
      'Walt Brennan',
    );
  });

  it("names the buyer's team for seller's counsel", () => {
    expect(otherSide('seller', ['Walt Brennan'], 'Harbor Holdings')).toBe(
      'Harbor Holdings',
    );
  });

  it("says the seller is not invited yet when buyer's counsel has no seller", () => {
    expect(otherSide('buyer', [], 'Harbor Holdings')).toBe('Not invited yet');
  });
});
