import { describe, expect, it } from 'vitest';

import { planRelayDispatch, routeRelayEvent, type RelayEvent } from './relay';

function event(partial: Partial<RelayEvent>): RelayEvent {
  return {
    globalSeq: 1,
    dealId: 'deal-1',
    dealSeq: 1,
    aggregateType: 'deal',
    eventType: 'deal.updated',
    resolution: null,
    ...partial,
  };
}

describe('routeRelayEvent', () => {
  it('routes deal.created to duplicate detection and activity recording', () => {
    expect(routeRelayEvent(event({ eventType: 'deal.created' }))).toEqual([
      'detectDuplicates',
      'recordDealActivity',
    ]);
  });

  it('routes any other deal-aggregate event to activity recording only', () => {
    expect(routeRelayEvent(event({ eventType: 'deal.stage_changed' }))).toEqual([
      'recordDealActivity',
    ]);
  });

  it('routes a won resolution to activity recording and the close pool', () => {
    expect(
      routeRelayEvent(event({ eventType: 'deal.resolved', resolution: 'won' })),
    ).toEqual(['recordDealActivity', 'anonymizeClose']);
  });

  it('does not route a lost resolution to the close pool', () => {
    expect(
      routeRelayEvent(event({ eventType: 'deal.resolved', resolution: 'lost' })),
    ).toEqual(['recordDealActivity']);
  });

  it('routes a non-deal aggregate to no consumer', () => {
    expect(
      routeRelayEvent(event({ aggregateType: 'offer', eventType: 'offer.submitted' })),
    ).toEqual([]);
  });
});

describe('planRelayDispatch', () => {
  it('orders steps by global_seq and advances the cursor to the last event', () => {
    const plan = planRelayDispatch(
      [
        event({ globalSeq: 12, eventType: 'deal.updated' }),
        event({ globalSeq: 10, eventType: 'deal.created' }),
      ],
      5,
    );
    expect(plan.steps.map((step) => step.event.globalSeq)).toEqual([10, 12]);
    expect(plan.cursor).toBe(12);
  });

  it('advances the cursor past events with no consumer without dispatching them', () => {
    const plan = planRelayDispatch(
      [event({ globalSeq: 7, aggregateType: 'offer', eventType: 'offer.submitted' })],
      5,
    );
    expect(plan.steps).toEqual([]);
    expect(plan.cursor).toBe(7);
  });

  it('skips events at or below the cursor', () => {
    const plan = planRelayDispatch(
      [
        event({ globalSeq: 5, eventType: 'deal.created' }),
        event({ globalSeq: 6, eventType: 'deal.updated' }),
      ],
      5,
    );
    expect(plan.steps.map((step) => step.event.globalSeq)).toEqual([6]);
    expect(plan.cursor).toBe(6);
  });

  it('leaves the cursor unchanged on an empty batch', () => {
    expect(planRelayDispatch([], 9)).toEqual({ steps: [], cursor: 9 });
  });
});
