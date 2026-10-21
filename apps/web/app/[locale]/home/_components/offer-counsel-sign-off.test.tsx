// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ContractReview } from './contract-review-panel';
import { buttonNames, clearScreen, pageText, show } from './lender-test-kit';
import { OfferCounselSignOff } from './offer-counsel-sign-off';

vi.mock(
  'next/navigation',
  async () => (await import('./lender-test-kit')).navigation,
);
vi.mock('@odb/contracts', async () =>
  (await import('./lender-test-kit')).fakeActions(
    'requestContractReview',
    'decideContractReview',
    'overrideContractSigning',
  ),
);
vi.mock('@odb/deals/server', async () =>
  (await import('./lender-test-kit')).fakeActions('sendContractForSignature'),
);

const waitingOnSeller: ContractReview = {
  required: true,
  ready: false,
  sendable: false,
  counsel: { buyer: true, seller: true },
  requests: [{ requestedAt: '2026-10-19T15:00:00Z' }],
  decisions: [
    {
      side: 'buyer',
      decision: 'approved',
      note: null,
      withoutCounsel: false,
      decidedAt: '2026-10-19T18:00:00Z',
    },
  ],
  overrides: [],
};

afterEach(clearScreen);

describe('counsel sign-off on an accepted offer', () => {
  it('shows who the LOI is waiting on and since when, with no actions', () => {
    show(
      <OfferCounselSignOff
        reviews={[
          { type: 'loi', contractVersionId: 'v-1', review: waitingOnSeller },
        ]}
      />,
    );

    expect(pageText()).toContain('LOI counsel sign-off');
    expect(pageText()).toContain("Buyer's counsel Approved");
    expect(pageText()).toContain("Seller's counsel Waiting since Oct 19, 2026");
    expect(buttonNames()).toEqual([]);
  });

  it('shows nothing when the offer has no LOI or APA yet', () => {
    show(<OfferCounselSignOff reviews={[]} />);

    expect(pageText()).toBe('');
  });
});
