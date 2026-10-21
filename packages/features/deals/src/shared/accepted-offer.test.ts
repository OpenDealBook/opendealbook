import { describe, expect, it } from 'vitest';

import { type DealOffer, acceptedOffer } from './queries';

const approvedFirst = { id: 'v1', number: 1, approved_at: '2026-10-01T00:00:00Z' };
const acceptedCounter = { id: 'v2', number: 2, approved_at: null };
const ACCEPTED_AT = '2026-10-09T15:00:00Z';

function offer(status: string): DealOffer {
  return {
    offer: {
      id: 'offer-1',
      status,
      current_version_id: acceptedCounter.id,
      responded_at: status === 'accepted' ? ACCEPTED_AT : null,
    },
    versions: [approvedFirst, acceptedCounter],
    currentVersion: acceptedCounter,
  } as unknown as DealOffer;
}

describe('acceptedOffer', () => {
  it('carries the acceptance time and the version current at acceptance', () => {
    const accepted = acceptedOffer({ live: offer('accepted'), history: [] });

    expect(accepted?.offer.responded_at).toBe(ACCEPTED_AT);
    expect(accepted?.currentVersion?.id).toBe('v2');
  });

  it.each(['draft', 'submitted', 'countered'])(
    'is absent while the live offer is %s',
    (status) => {
      expect(acceptedOffer({ live: offer(status), history: [] })).toBeNull();
    },
  );

  it('is absent when no offer is live', () => {
    expect(acceptedOffer({ live: null, history: [offer('rejected')] })).toBeNull();
  });
});
