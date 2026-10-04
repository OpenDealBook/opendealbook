import { describe, expect, it } from 'vitest';

import { summarizeBuckets } from './comps-summary';

describe('summarizeBuckets', () => {
  it('reports zero buckets and zero contributions for an empty pool', () => {
    expect(summarizeBuckets([])).toEqual({ buckets: 0, contributions: 0 });
  });

  it('counts the visible buckets and sums their contributions', () => {
    expect(summarizeBuckets([{ n: 7 }, { n: 5 }])).toEqual({
      buckets: 2,
      contributions: 12,
    });
  });

  it('treats a null count as zero contributions while still counting the bucket', () => {
    expect(summarizeBuckets([{ n: null }, { n: 6 }])).toEqual({
      buckets: 2,
      contributions: 6,
    });
  });
});
