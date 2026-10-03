import { describe, expect, it } from 'vitest';

import {
  dealAge,
  daysInStage,
  earningsMargin,
  earningsMultiple,
  multipleOnOffer,
  offerVsAskingPct,
  revenueMultiple,
  sdeMargin,
  sdeMultiple,
} from './derived';

describe('derived values', () => {
  it('computes multiples, margin, and offer comparisons', () => {
    expect(revenueMultiple(1_000_000, 500_000)).toBe(2);
    expect(sdeMultiple(1_000_000, 200_000)).toBe(5);
    expect(sdeMargin(200_000, 1_000_000)).toBe(0.2);
    expect(multipleOnOffer(900_000, 200_000)).toBe(4.5);
    expect(offerVsAskingPct(900_000, 1_000_000)).toBe(90);
  });

  it('returns null when a divisor input is null or zero', () => {
    expect(revenueMultiple(1_000_000, 0)).toBeNull();
    expect(sdeMultiple(1_000_000, null)).toBeNull();
    expect(sdeMargin(null, 1_000_000)).toBeNull();
    expect(offerVsAskingPct(900_000, 0)).toBeNull();
  });

  it('selects the earnings value by basis for multiples and margins', () => {
    expect(earningsMultiple('sde', 1_000_000, 200_000, 250_000)).toBe(5);
    expect(earningsMultiple('ebitda', 1_000_000, 200_000, 250_000)).toBe(4);
    expect(earningsMargin('sde', 1_000_000, 200_000, 250_000)).toBe(0.2);
    expect(earningsMargin('ebitda', 1_000_000, 200_000, 250_000)).toBe(0.25);
  });

  it('measures days in stage and deal age from timestamps', () => {
    expect(daysInStage('2026-09-01T00:00:00Z', '2026-09-10T00:00:00Z')).toBe(9);
    expect(dealAge('2026-08-01T00:00:00Z', '2026-09-30T00:00:00Z')).toBe(60);
  });
});
