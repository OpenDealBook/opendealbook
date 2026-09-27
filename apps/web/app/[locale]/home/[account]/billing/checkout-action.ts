'use server';

import { createBillingGatewayService } from '@tuckin/billing-gateway';
import { createStripeBillingStrategy } from '@tuckin/stripe';

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
