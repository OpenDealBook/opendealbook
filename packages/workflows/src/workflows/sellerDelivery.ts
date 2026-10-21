import { ActivityFailure, proxyActivities } from '@temporalio/workflow';

import type * as activities from '../activities';
import type { SellerDeliveryInput } from '../sellerDelivery/activities';
import {
  SELLER_DELIVERY_ATTEMPTS,
  sellerDeliveryFailedMessage,
} from '../sellerDelivery/messages';
import type { SellerDeliveryProblem } from '../sellerDelivery/notify';

const { deliverDocumentToSeller } = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes',
  retry: {
    maximumAttempts: SELLER_DELIVERY_ATTEMPTS,
    initialInterval: '2 minutes',
    backoffCoefficient: 2,
  },
});

const {
  notifyTeamOfSellerDeliveryProblem,
  emailSenderOfSellerDeliveryProblem,
} = proxyActivities<typeof activities>({ startToCloseTimeout: '1 minute' });

export interface SellerDeliveryWorkflowInput extends SellerDeliveryInput {
  accountId: string;
  dealId: string;
  senderUserId: string;
}

export async function sellerDelivery(
  input: SellerDeliveryWorkflowInput,
): Promise<void> {
  try {
    await deliverDocumentToSeller(input);
  } catch (error) {
    if (!(error instanceof ActivityFailure)) {
      throw error;
    }

    await sellerSendProblem({
      accountId: input.accountId,
      dealId: input.dealId,
      senderUserId: input.senderUserId,
      message: sellerDeliveryFailedMessage(input),
    });

    throw error;
  }
}

export async function sellerSendProblem(
  problem: SellerDeliveryProblem,
): Promise<void> {
  await notifyTeamOfSellerDeliveryProblem(problem);
  await emailSenderOfSellerDeliveryProblem(problem);
}
