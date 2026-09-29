import { describe, expect, it } from 'vitest';

import { payrollTaxVsW2Check } from './payroll-tax-vs-w2';

describe('payrollTaxVsW2Check.evaluate', () => {
  it('reports info when equal', () => {
    const [finding] = payrollTaxVsW2Check.evaluate({
      period: '2024',
      w2WagesTotal: 1_000_000,
      payrollTaxWagesTotal: 1_000_000,
    });

    expect(finding?.severity).toBe('info');
    expect(finding?.status).toBe('reconciled');
    expect(finding?.detail.deltaPct).toBe(0);
  });

  it('treats a delta of exactly 0.5% as info', () => {
    const [finding] = payrollTaxVsW2Check.evaluate({
      period: '2024',
      w2WagesTotal: 1_005_000,
      payrollTaxWagesTotal: 1_000_000,
    });

    expect(finding?.detail.deltaPct).toBe(0.005);
    expect(finding?.severity).toBe('info');
  });

  it('reports warning just above 0.5%', () => {
    const [finding] = payrollTaxVsW2Check.evaluate({
      period: '2024',
      w2WagesTotal: 1_006_000,
      payrollTaxWagesTotal: 1_000_000,
    });

    expect(finding?.severity).toBe('warning');
    expect(finding?.status).toBe('discrepancy');
  });

  it('treats a delta of exactly 2% as warning', () => {
    const [finding] = payrollTaxVsW2Check.evaluate({
      period: '2024',
      w2WagesTotal: 1_020_000,
      payrollTaxWagesTotal: 1_000_000,
    });

    expect(finding?.detail.deltaPct).toBe(0.02);
    expect(finding?.severity).toBe('warning');
  });

  it('reports error above 2%', () => {
    const [finding] = payrollTaxVsW2Check.evaluate({
      period: '2024',
      w2WagesTotal: 1_030_000,
      payrollTaxWagesTotal: 1_000_000,
    });

    expect(finding?.severity).toBe('error');
    expect(finding?.status).toBe('discrepancy');
  });

  it('reports error with missing status when a side is null', () => {
    const [finding] = payrollTaxVsW2Check.evaluate({
      period: '2024',
      w2WagesTotal: null,
      payrollTaxWagesTotal: 1_000_000,
    });

    expect(finding?.severity).toBe('error');
    expect(finding?.status).toBe('missing');
    expect(finding?.detail.deltaPct).toBeNull();
  });

  it('reports error with missing status when the denominator is zero', () => {
    const [finding] = payrollTaxVsW2Check.evaluate({
      period: '2024',
      w2WagesTotal: 1_000_000,
      payrollTaxWagesTotal: 0,
    });

    expect(finding?.severity).toBe('error');
    expect(finding?.status).toBe('missing');
  });

  it('carries the check key, detail figures, and link refs on the finding', () => {
    const [finding] = payrollTaxVsW2Check.evaluate({
      period: '2024',
      w2WagesTotal: 1_006_000,
      payrollTaxWagesTotal: 1_000_000,
      links: { drDocumentId: 'doc-1', checklistItemId: 'item-1' },
    });

    expect(finding?.checkKey).toBe('payroll_tax_vs_w2');
    expect(finding?.detail).toEqual({
      period: '2024',
      expected: 1_000_000,
      actual: 1_006_000,
      deltaPct: 0.006,
    });
    expect(finding?.links).toEqual({ drDocumentId: 'doc-1', checklistItemId: 'item-1' });
  });

  it('defaults links to an empty object', () => {
    const [finding] = payrollTaxVsW2Check.evaluate({
      period: '2024',
      w2WagesTotal: 1_000_000,
      payrollTaxWagesTotal: 1_000_000,
    });

    expect(finding?.links).toEqual({});
  });
});
