'use server';

import { createBillingGatewayService } from '@odb/billing-gateway';
import { createStripeBillingStrategy } from '@odb/stripe';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { requireBilling } from '~/config/billing-gate';

interface TeamCheckoutParams {
  accountId: string;
  productId: string;
  planId: string;
  returnUrl: string;
}

export async function createTeamCheckoutAction(params: TeamCheckoutParams) {
  requireBilling();
  const client = getSupabaseServerClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  const { data: canManageBilling } = await client
    .rpc('has_permission', {
      user_id: user!.id,
      account_id: params.accountId,
      permission_name: 'billing.manage',
    })
    .throwOnError();

  if (!canManageBilling) {
    throw new Error('Only the team owner can change the plan.');
  }

  const service = createBillingGatewayService(createStripeBillingStrategy());

  const { checkoutToken } = await service.createCheckoutSession({
    accountId: params.accountId,
    productId: params.productId,
    planId: params.planId,
    returnUrl: params.returnUrl,
  });

  return checkoutToken;
}
