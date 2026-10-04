import { describe, expect, it } from 'vitest';

import { evaluateDealBoxScreen } from './queries';

const ADOPTED_DSCR = 1.43;
const ADOPTED_NET_CASH_FLOW = 507_676;

describe('evaluateDealBoxScreen', () => {
  it('passes when the adopted figures clear both criteria', () => {
    const screen = evaluateDealBoxScreen({
      dscr: ADOPTED_DSCR,
      netCashFlow: ADOPTED_NET_CASH_FLOW,
      minDscr: 1.25,
      requiredPersonalCashFlow: 400_000,
    });

    expect(screen.dscrPass).toBe(true);
    expect(screen.cashFlowPass).toBe(true);
    expect(screen.pass).toBe(true);
    expect(screen.dscr).toBe(ADOPTED_DSCR);
    expect(screen.netCashFlow).toBe(ADOPTED_NET_CASH_FLOW);
  });

  it('fails the DSCR component when below the minimum', () => {
    const screen = evaluateDealBoxScreen({
      dscr: ADOPTED_DSCR,
      netCashFlow: ADOPTED_NET_CASH_FLOW,
      minDscr: 1.5,
      requiredPersonalCashFlow: 400_000,
    });

    expect(screen.dscrPass).toBe(false);
    expect(screen.cashFlowPass).toBe(true);
    expect(screen.pass).toBe(false);
  });

  it('fails the cash-flow component when below the requirement', () => {
    const screen = evaluateDealBoxScreen({
      dscr: ADOPTED_DSCR,
      netCashFlow: ADOPTED_NET_CASH_FLOW,
      minDscr: 1.25,
      requiredPersonalCashFlow: 600_000,
    });

    expect(screen.dscrPass).toBe(true);
    expect(screen.cashFlowPass).toBe(false);
    expect(screen.pass).toBe(false);
  });

  it('leaves an unset criterion out of the verdict', () => {
    const screen = evaluateDealBoxScreen({
      dscr: ADOPTED_DSCR,
      netCashFlow: ADOPTED_NET_CASH_FLOW,
      minDscr: 1.25,
      requiredPersonalCashFlow: null,
    });

    expect(screen.dscrPass).toBe(true);
    expect(screen.cashFlowPass).toBeNull();
    expect(screen.pass).toBe(true);
  });

  it('treats missing snapshot values as zero', () => {
    const screen = evaluateDealBoxScreen({
      dscr: null,
      netCashFlow: null,
      minDscr: 1.25,
      requiredPersonalCashFlow: 400_000,
    });

    expect(screen.dscr).toBe(0);
    expect(screen.netCashFlow).toBe(0);
    expect(screen.dscrPass).toBe(false);
    expect(screen.cashFlowPass).toBe(false);
    expect(screen.pass).toBe(false);
  });
});
