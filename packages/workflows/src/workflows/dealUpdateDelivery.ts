import { ActivityFailure, proxyActivities } from '@temporalio/workflow';

import type * as activities from '../activities';
import type { DealUpdateDeliveryInput } from '../dealUpdateDelivery/activities';

const { deliverDealUpdate } = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes',
  retry: {
    maximumAttempts: 5,
    initialInterval: '2 minutes',
    backoffCoefficient: 2,
  },
});

const { finishDealUpdateDelivery } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
});

export async function dealUpdateDelivery(
  input: DealUpdateDeliveryInput,
): Promise<void> {
  try {
    await deliverDealUpdate(input);
  } catch (error) {
    if (!(error instanceof ActivityFailure)) {
      throw error;
    }
  }

  await finishDealUpdateDelivery(input);
}
