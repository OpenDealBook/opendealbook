import { describe, expect, it } from 'vitest';

import {
  planDealEventNotifications,
  routeDealEventNotification,
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
    expect(routeDealEventNotification(event({ eventType: 'offer.submitted' }))).toBe(
      'deal.offer_submitted',
    );
  });

  it('maps an accepted offer to its Novu workflow', () => {
    expect(routeDealEventNotification(event({ eventType: 'offer.accepted' }))).toBe(
      'deal.offer_accepted',
    );
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
    expect(routeDealEventNotification(event({ eventType: 'deal.resolved' }))).toBe(
      'deal.resolved',
    );
  });

  it('does not notify on a stage change into an unremarkable stage', () => {
    expect(
      routeDealEventNotification(
        event({ eventType: 'deal.stage_changed', stage: 'loi_submitted' }),
      ),
    ).toBeNull();
  });

  it('does not notify on an unrelated event', () => {
    expect(routeDealEventNotification(event({ eventType: 'deal.updated' }))).toBeNull();
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
