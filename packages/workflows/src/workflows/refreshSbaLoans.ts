import { proxyActivities } from '@temporalio/workflow';

import { SBA_LOAN_TO_PRICE_DEFAULT } from '@odb/comps';

import type * as activities from '../activities';

const { discoverSbaResources, loadDealBoxNaicsUnion, refreshSbaProgram } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: '30 minutes',
});

export interface RefreshSbaLoansInput {
  loanToPriceRatio?: number;
}

export interface RefreshSbaLoansResult {
  sevenA: number;
  fiveOhFour: number;
}

export async function refreshSbaLoans(
  input: RefreshSbaLoansInput = {},
): Promise<RefreshSbaLoansResult> {
  const ratio = input.loanToPriceRatio ?? SBA_LOAN_TO_PRICE_DEFAULT;
  const naicsCodes = await loadDealBoxNaicsUnion();
  const { sevenA, fiveOhFour } = await discoverSbaResources();

  const sevenAResult = await refreshSbaProgram({ program: '7a', urls: sevenA, naicsCodes, ratio });
  const fiveOhFourResult = await refreshSbaProgram({
    program: '504',
    urls: fiveOhFour,
    naicsCodes,
    ratio,
  });

  return { sevenA: sevenAResult.upserted, fiveOhFour: fiveOhFourResult.upserted };
}
