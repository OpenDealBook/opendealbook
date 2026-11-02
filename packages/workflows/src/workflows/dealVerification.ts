import {
  condition,
  defineSignal,
  proxyActivities,
  setHandler,
} from '@temporalio/workflow';

import type * as activities from '../activities';
import { DEAL_VERIFICATION_SIGNAL } from '../ids';

const { runDealVerification } = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 minutes',
});

export const DEAL_VERIFICATION_QUIET_PERIOD = '5 minutes';

const documentIngested = defineSignal(DEAL_VERIFICATION_SIGNAL);

export interface DealVerificationInput {
  dealId: string;
}

export async function dealVerification(
  input: DealVerificationInput,
): Promise<void> {
  let ingested = false;
  setHandler(documentIngested, () => {
    ingested = true;
  });

  do {
    do {
      ingested = false;
    } while (await condition(() => ingested, DEAL_VERIFICATION_QUIET_PERIOD));

    await runDealVerification({ dealId: input.dealId });
  } while (ingested);
}
