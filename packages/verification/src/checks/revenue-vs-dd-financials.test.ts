import { describe, expect, it } from 'vitest';

import { revenueVsDdFinancialsCheck } from './revenue-vs-dd-financials';

describe('revenueVsDdFinancialsCheck.evaluate', () => {
  it('reports info when equal', () => {
    const [finding] = revenueVsDdFinancialsCheck.evaluate({
      period: '2024',
      marketingRevenue: 5_000_000,
      ddFinancialsRevenue: 5_000_000,
    });

    expect(finding?.severity).toBe('info');
    expect(finding?.status).toBe('reconciled');
    expect(finding?.detail.deltaPct).toBe(0);
  });

  it('treats a delta of exactly 1% as info', () => {
    const [finding] = revenueVsDdFinancialsCheck.evaluate({
      period: '2024',
      marketingRevenue: 5_050_000,
      ddFinancialsRevenue: 5_000_000,
    });

    expect(finding?.detail.deltaPct).toBe(0.01);
    expect(finding?.severity).toBe('info');
  });

  it('reports warning just above 1%', () => {
    const [finding] = revenueVsDdFinancialsCheck.evaluate({
      period: '2024',
      marketingRevenue: 5_100_000,
      ddFinancialsRevenue: 5_000_000,
    });

    expect(finding?.severity).toBe('warning');
    expect(finding?.status).toBe('discrepancy');
  });

  it('treats a delta of exactly 5% as warning', () => {
    const [finding] = revenueVsDdFinancialsCheck.evaluate({
      period: '2024',
      marketingRevenue: 5_250_000,
      ddFinancialsRevenue: 5_000_000,
    });

    expect(finding?.detail.deltaPct).toBe(0.05);
    expect(finding?.severity).toBe('warning');
  });

  it('reports error above 5%', () => {
    const [finding] = revenueVsDdFinancialsCheck.evaluate({
      period: '2024',
      marketingRevenue: 5_500_000,
      ddFinancialsRevenue: 5_000_000,
    });

    expect(finding?.severity).toBe('error');
    expect(finding?.status).toBe('discrepancy');
  });

  it('uses the DD financials figure as the denominator', () => {
    const [finding] = revenueVsDdFinancialsCheck.evaluate({
      period: '2024',
      marketingRevenue: 5_200_000,
      ddFinancialsRevenue: 5_000_000,
    });

    expect(finding?.detail).toEqual({
      period: '2024',
      expected: 5_000_000,
      actual: 5_200_000,
      deltaPct: 0.04,
    });
    expect(finding?.checkKey).toBe('revenue_vs_dd_financials');
  });

  it('reports error with missing status when a side is null', () => {
    const [finding] = revenueVsDdFinancialsCheck.evaluate({
      period: '2024',
      marketingRevenue: 5_000_000,
      ddFinancialsRevenue: null,
    });

    expect(finding?.severity).toBe('error');
    expect(finding?.status).toBe('missing');
    expect(finding?.detail.deltaPct).toBeNull();
  });
});
