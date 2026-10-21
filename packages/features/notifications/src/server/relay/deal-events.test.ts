import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  counselItemPath,
  dataRoomDocumentPath,
  dealPath,
  isItemAnchor,
  planDealEventNotifications,
  routeDealEventNotification,
  sellerItemPath,
  teamItemPath,
  type NotifiableDealEvent,
} from './deal-events';

function event(partial: Partial<NotifiableDealEvent>): NotifiableDealEvent {
  return {
    globalSeq: 1,
    dealId: 'deal-1',
    accountId: 'acct-1',
    actorRef: 'user-1',
    eventType: 'deal.updated',
    stage: null,
    ...partial,
  };
}

describe('routeDealEventNotification', () => {
  it('maps a submitted offer to its Novu workflow', () => {
    expect(
      routeDealEventNotification(event({ eventType: 'offer.submitted' })),
    ).toBe('deal.offer_submitted');
  });

  it('maps an accepted offer to its Novu workflow', () => {
    expect(
      routeDealEventNotification(event({ eventType: 'offer.accepted' })),
    ).toBe('deal.offer_accepted');
  });

  it('maps a stage change into loi_accepted to the signed-LOI workflow', () => {
    expect(
      routeDealEventNotification(
        event({ eventType: 'deal.stage_changed', stage: 'loi_accepted' }),
      ),
    ).toBe('deal.loi_accepted');
  });

  it('maps a stage change into pa_accepted to the signed-APA workflow', () => {
    expect(
      routeDealEventNotification(
        event({ eventType: 'deal.stage_changed', stage: 'pa_accepted' }),
      ),
    ).toBe('deal.apa_accepted');
  });

  it('maps a resolution to the resolution workflow', () => {
    expect(
      routeDealEventNotification(event({ eventType: 'deal.resolved' })),
    ).toBe('deal.resolved');
  });

  it('maps a document added to a data room to the lender documents workflow', () => {
    expect(
      routeDealEventNotification(event({ eventType: 'dr_document.added' })),
    ).toBe('lender-room-documents');
  });

  it.each([
    'contract.version_added',
    'contract.version_shown_to_seller_side',
    'contract.comment_posted',
    'contract.review_requested',
    'contract.review_decided',
    'contract.signing_overridden',
  ])('maps %s to the contract negotiation workflow', (eventType) => {
    expect(routeDealEventNotification(event({ eventType }))).toBe(
      'contract-negotiation',
    );
  });

  it('maps a seller and counsel thread post to its Novu workflow', () => {
    expect(
      routeDealEventNotification(
        event({ eventType: 'seller_counsel_message.posted' }),
      ),
    ).toBe('seller-counsel-message.posted');
  });

  it('does not notify when a version is adopted as current', () => {
    expect(
      routeDealEventNotification(event({ eventType: 'contract.version_set' })),
    ).toBeNull();
  });

  it('does not notify on a stage change into an unremarkable stage', () => {
    expect(
      routeDealEventNotification(
        event({ eventType: 'deal.stage_changed', stage: 'loi_submitted' }),
      ),
    ).toBeNull();
  });

  it('does not notify on an unrelated event', () => {
    expect(
      routeDealEventNotification(event({ eventType: 'deal.updated' })),
    ).toBeNull();
  });
});

describe('planDealEventNotifications', () => {
  it('keeps only notifiable events and advances the cursor past every row read', () => {
    const plan = planDealEventNotifications(
      [
        event({ globalSeq: 5, eventType: 'offer.submitted' }),
        event({ globalSeq: 6, eventType: 'deal.updated' }),
        event({ globalSeq: 7, eventType: 'deal.resolved' }),
      ],
      4,
    );

    expect(plan.steps.map((step) => step.workflowId)).toEqual([
      'deal.offer_submitted',
      'deal.resolved',
    ]);
    expect(plan.steps.map((step) => step.event.globalSeq)).toEqual([5, 7]);
    expect(plan.cursor).toBe(7);
  });

  it('skips events at or before the cursor', () => {
    const plan = planDealEventNotifications(
      [event({ globalSeq: 3, eventType: 'offer.submitted' })],
      3,
    );

    expect(plan.steps).toEqual([]);
    expect(plan.cursor).toBe(3);
  });
});

describe('dealPath', () => {
  it('links a team deal under the team slug', () => {
    expect(dealPath('acme-capital', 'deal-1')).toBe(
      '/home/acme-capital/deals/deal-1',
    );
  });

  it('accepts only a team slug, since every deal belongs to a team', () => {
    expectTypeOf(dealPath).parameter(0).toEqualTypeOf<string>();
  });
});

describe('teamItemPath', () => {
  const at = (kind: Parameters<typeof teamItemPath>[2]['kind']) =>
    teamItemPath('acme', 'deal-1', { kind, id: 'x-1' });

  it('opens each item on the deal tab that shows it, at the item', () => {
    expect(at('checklist-item')).toBe(
      '/home/acme/deals/deal-1/diligence#checklist-item-x-1',
    );
    expect(at('todo')).toBe('/home/acme/deals/deal-1/todos#todo-x-1');
    expect(at('seller-question')).toBe(
      '/home/acme/deals/deal-1/parties#seller-question-x-1',
    );
    expect(at('counsel-message')).toBe(
      '/home/acme/deals/deal-1/parties#counsel-message-x-1',
    );
    expect(at('contract-version')).toBe(
      '/home/acme/deals/deal-1/documents#contract-version-x-1',
    );
    expect(at('contract-review')).toBe(
      '/home/acme/deals/deal-1/documents#contract-review-x-1',
    );
    expect(at('contract-comment')).toBe(
      '/home/acme/deals/deal-1/documents#contract-comment-x-1',
    );
    expect(at('offer')).toBe('/home/acme/deals/deal-1/financials#offer-x-1');
    expect(at('deal-update')).toBe('/home/acme/deals/deal-1#deal-update-x-1');
    expect(at('milestone')).toBe('/home/acme/deals/deal-1#milestone-x-1');
    expect(at('must-close-by')).toBe(
      '/home/acme/deals/deal-1/lenders#must-close-by-x-1',
    );
    expect(at('lender-timeline-answer')).toBe(
      '/home/acme/deals/deal-1/lenders#lender-timeline-answer-x-1',
    );
  });
});

describe('counselItemPath', () => {
  it('opens contract items and counsel messages in the counsel portal, never a team page', () => {
    expect(
      counselItemPath('deal-1', { kind: 'contract-version', id: 'v-1' }),
    ).toBe('/counsel/deal-1/contracts#contract-version-v-1');
    expect(
      counselItemPath('deal-1', { kind: 'contract-comment', id: 'c-1' }),
    ).toBe('/counsel/deal-1/contracts#contract-comment-c-1');
    expect(
      counselItemPath('deal-1', { kind: 'contract-review', id: 'v-1' }),
    ).toBe('/counsel/deal-1/contracts#contract-review-v-1');
    expect(
      counselItemPath('deal-1', { kind: 'counsel-message', id: 'm-1' }),
    ).toBe('/counsel/deal-1/messages#counsel-message-m-1');
  });
});

describe('sellerItemPath', () => {
  it('opens contract items and seller questions in the seller room, never a team page', () => {
    expect(
      sellerItemPath('room-1', { kind: 'contract-version', id: 'v-1' }),
    ).toBe('/seller/rooms/room-1/contracts#contract-version-v-1');
    expect(
      sellerItemPath('room-1', { kind: 'contract-comment', id: 'c-1' }),
    ).toBe('/seller/rooms/room-1/contracts#contract-comment-c-1');
    expect(
      sellerItemPath('room-1', { kind: 'contract-review', id: 'v-1' }),
    ).toBe('/seller/rooms/room-1/contracts#contract-review-v-1');
    expect(
      sellerItemPath('room-1', { kind: 'seller-question', id: 'q-1' }),
    ).toBe('/seller/rooms/room-1#seller-question-q-1');
  });
});

describe('isItemAnchor', () => {
  it('tells an item anchor from a section anchor', () => {
    expect(isItemAnchor('checklist-item-x-1')).toBe(true);
    expect(isItemAnchor('seller-room')).toBe(false);
  });
});

describe('seller and counsel thread links', () => {
  it('leads the seller to the message in their room thread', () => {
    expect(
      sellerItemPath('room-1', { kind: 'seller-counsel-message', id: 'm-1' }),
    ).toBe('/seller/rooms/room-1/counsel#seller-counsel-message-m-1');
  });

  it("leads seller's counsel to the message in their client thread", () => {
    expect(
      counselItemPath('deal-1', { kind: 'seller-counsel-message', id: 'm-1' }),
    ).toBe('/counsel/deal-1/client#seller-counsel-message-m-1');
  });

  it('treats a thread message anchor as an item to focus', () => {
    expect(isItemAnchor('seller-counsel-message-m-1')).toBe(true);
  });
});

describe('dataRoomDocumentPath', () => {
  it('opens a document in the deal data room window', () => {
    expect(dataRoomDocumentPath('acme', 'deal-1', 'doc-1')).toBe(
      '/deal-windows/acme/deal-1/data-room/view?doc=doc-1',
    );
  });
});
