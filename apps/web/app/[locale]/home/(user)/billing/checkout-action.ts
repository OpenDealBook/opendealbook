'use server';

import { redirect } from 'next/navigation';

import { createBillingGatewayService } from '@tuckin/billing-gateway';
import { createStripeBillingStrategy } from '@tuckin/stripe';
import { getSupabaseServerClient } from '@tuckin/supabase/server';

import appConfig from '~/config/app.config';

export async function createCheckout(params: {
  productId: string;
  planId: string;
}) {
  const client = getSupabaseServerClient();

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    redirect('/auth/sign-in');
  }

  const gateway = createBillingGatewayService(createStripeBillingStrategy());

  const { checkoutToken } = await gateway.createCheckoutSession({
    accountId: user.id,
    productId: params.productId,
    planId: params.planId,
    returnUrl: `${appConfig.url}/home/billing`,
    customerEmail: user.email,
  });

  return checkoutToken;
}
