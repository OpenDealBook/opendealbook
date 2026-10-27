// @vitest-environment jsdom
import type { ComponentProps } from 'react';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  alerts,
  buttonNames,
  clearScreen,
  fakeActions,
  fakeServer,
  linkTo,
  pageText,
  press,
  show,
} from './lender-test-kit';
import { MatchReviewList, type MatchReview } from './match-review-list';

vi.mock(
  'next/navigation',
  async () => (await import('./lender-test-kit')).navigation,
);

type Props = ComponentProps<typeof MatchReviewList>;

const review: MatchReview = {
  id: 'r0000000-0000-4000-8000-000000000001',
  reason: 'weak_match',
  score: 0.72,
  source: 'ppp',
  recordName: 'Acme Plumbing and Heating',
  recordLocation: 'Austin, TX',
  candidateName: 'Acme Plumbing LLC',
};

function showList(overrides: Partial<Props> = {}) {
  show(
    <MatchReviewList
      reviews={[review]}
      canDecide={true}
      workflowsHref={'/home/team-one/workflows'}
      {...(fakeActions('decide') as Pick<Props, 'decide'>)}
      {...overrides}
    />,
  );
}

beforeEach(() => fakeServer.reset());
afterEach(clearScreen);

it('shows the source record against the candidate business with its score', () => {
  showList();

  const text = pageText();

  expect(text).toContain('PPP record');
  expect(text).toContain('Acme Plumbing and Heating');
  expect(text).toContain('Austin, TX');
  expect(text).toContain('Acme Plumbing LLC');
  expect(text).toContain('Score 0.72');
});

it('names a weak match as such', () => {
  showList();

  expect(pageText()).toContain('Weak match');
  expect(pageText()).not.toContain('Different EIN');
});

it('shows both EINs when the record and the candidate disagree on EIN', () => {
  showList({
    reviews: [
      {
        ...review,
        reason: 'ein_conflict',
        score: 0.95,
        source: 'form_5500',
        recordEin: '123456789',
        candidateEin: '987654321',
      },
    ],
  });

  const text = pageText();

  expect(text).toContain('Different EIN');
  expect(text).not.toContain('Weak match');
  expect(text).toContain('EIN 123456789');
  expect(text).toContain('EIN 987654321');
});

it.each([
  ['Accept', true],
  ['Reject', false],
] as const)('%ss a match and refreshes', async (name, accept) => {
  showList();

  await press(name);

  expect(fakeServer.inputsTo('decide')).toEqual([
    { reviewId: review.id, accept },
  ]);
  expect(fakeServer.refreshes).toBe(1);
});

it('shows the refusal when the server refuses', async () => {
  fakeServer.refusal =
    'Only deal managers can review matches. Ask a deal manager.';
  showList();

  await press('Accept');

  expect(alerts()).toEqual([
    'Only deal managers can review matches. Ask a deal manager.',
  ]);
});

it('shows no review buttons to members who cannot manage deals', () => {
  showList({ canDecide: false });

  expect(pageText()).toContain('Acme Plumbing LLC');
  expect(buttonNames()).toEqual([]);
});

it('explains where weak matches come from when none wait for review', () => {
  showList({ reviews: [] });

  expect(pageText()).toContain(
    'No weak matches to review. When a workflow imports a record that might belong to one of your firms, it waits here for a deal manager.',
  );
  expect(linkTo('Open Workflows')).toBe('/home/team-one/workflows');
});
