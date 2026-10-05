import { describe, expect, it } from 'vitest';

import { trendBarHeights } from './deal-operating-trend';

describe('trendBarHeights', () => {
  it('returns an empty array for an empty series', () => {
    expect(trendBarHeights([])).toEqual([]);
  });

  it('returns null for every null entry when nothing is comparable', () => {
    expect(trendBarHeights([null, null])).toEqual([null, null]);
  });

  it('scales a single value to full height', () => {
    expect(trendBarHeights([42])).toEqual([100]);
  });

  it('scales by the largest magnitude, including negative values', () => {
    expect(trendBarHeights([-50, 100, null])).toEqual([50, 100, null]);
  });

  it('returns zero heights instead of dividing by zero when every value is zero', () => {
    expect(trendBarHeights([0, 0])).toEqual([0, 0]);
  });
});
