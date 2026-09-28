'use server';

import { createBillingGatewayService } from '@odb/billing-gateway';
import { createStripeBillingStrategy } from '@odb/stripe';

interface TeamCheckoutParams {
  accountId: string;
  productId: string;
  planId: string;
  returnUrl: string;
}

export async function createTeamCheckoutAction(params: TeamCheckoutParams) {
  const service = createBillingGatewayService(createStripeBillingStrategy());

  const { checkoutToken } = await service.createCheckoutSession({
    accountId: params.accountId,
    productId: params.productId,
    planId: params.planId,
    returnUrl: params.returnUrl,
  });

  return checkoutToken;
}
